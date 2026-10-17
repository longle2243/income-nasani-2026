/**
 * Sales Desk — không sử dụng thư viện ngoài.
 * Các hàm tính toán tách riêng khỏi giao diện để dễ bảo trì.
 * Mặc định giữ nguyên chính sách của ứng dụng cũ.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'sales-desk-v2';
  // Giá niêm yết với khách đã cộng 8%, nhưng doanh thu tính lương là giá gốc.
  const PRICE_MARKUP = 1.08;
  const DOMAIN_RATE = 0.05;
  const INCOME_DEDUCTION = 0.10; // Khấu trừ thu nhập theo chính sách người dùng cung cấp.
  const TAX_FREE_REVENUE = 5000000; // Doanh thu ghi nhận <= 5 triệu: không khấu trừ.
  const DOMAIN_OPTIONS = [
    { id: 'com', name: '.com', displayPrice: 452520 },
    { id: 'vn', name: '.vn', displayPrice: 820000 },
    { id: 'comvn', name: '.com.vn', displayPrice: 691000 }
  ];
  const priceWithMarkup = base => Math.round(safeNumber(base) * PRICE_MARKUP);
  const priceBeforeMarkup = display => safeNumber(display) / PRICE_MARKUP;

  const DEFAULT_CONFIG = {
    hostingOptions: [
      ['2GB',2388000],['5GB',4872000],['8GB',6504000],['10GB',7200000],
      ['12GB',8160000],['15GB',9600000],['20GB',12000000],['30GB',16080000],
      ['40GB',20080000],['50GB',24000000],['60GB',28008000],['70GB',32040000],
      ['100GB',43200000],['200GB',72000000],['300GB',96000000],['500GB',132000000],
      ['1TB',214800000],['2TB',294000000]
    ].map(([name, price]) => ({ id: name.toLowerCase(), name, price })),
    salaryLevels: [
      [0,0,10,10],[5000000,2000000,10,10],[8000000,2500000,10,15],
      [12000000,3000000,15,15],[16000000,4000000,15,15],
      [20000000,5000000,18,15],[25000000,6000000,20,15],
      [30000000,7000000,25,20],[40000000,8000000,30,20],
      [55000000,9000000,35,20],[70000000,10000000,35,25]
    ].map(([minRevenue, base, webRate, hostRate]) => ({ minRevenue, base, webRate, hostRate }))
  };

  const $ = selector => document.querySelector(selector);
  const money = amount => `${Math.round(amount).toLocaleString('vi-VN')} đ`;
  const safeNumber = value => Math.max(0, Number(value) || 0);
  const freshContract = () => ({ id: crypto.randomUUID?.() || `c-${Date.now()}-${Math.random()}`, webMillions: '', hostId: '', customHost: '', domainId: '', handover: false, shared: false });
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const stored = loadSaved();
  let config = stored?.config || clone(DEFAULT_CONFIG);
  let contracts = Array.isArray(stored?.contracts) && stored.contracts.length ? stored.contracts : [freshContract()];
  let settingsDraft = null;

  // Đọc dữ liệu lưu trước đó, nếu không hợp lệ thì khởi tạo mới.
  function loadSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (value?.config?.hostingOptions && value?.config?.salaryLevels && Array.isArray(value.contracts)) return value;
    } catch (_) { /* Trình duyệt hạn chế lưu hoặc dữ liệu lỗi */ }
    return null;
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, contracts })); }
    catch (_) { $('#saveIndicator').textContent = 'Không thể tự động lưu'; }
  }

  /** Tính doanh thu theo giá gốc; giá niêm yết +8% chỉ để hiển thị. */
  function calculateContract(contract, policy = config) {
    const webRaw = safeNumber(contract.webMillions) * 1000000;
    const hostOption = policy.hostingOptions.find(h => h.id === contract.hostId);
    // Giá Hosting tự nhập là giá khách thanh toán (đã +8%).
    const hostRaw = contract.hostId === 'custom'
      ? priceBeforeMarkup(contract.customHost)
      : safeNumber(hostOption?.price);
    const domainOption = DOMAIN_OPTIONS.find(d => d.id === contract.domainId);
    const domainRaw = domainOption ? priceBeforeMarkup(domainOption.displayPrice) : 0;
    const shareFactor = contract.shared ? 0.5 : 1;
    const webRevenue = webRaw * (contract.handover ? 1 : 0.5) * shareFactor;
    const hostRevenue = hostRaw * shareFactor;
    // Khi chia doanh thu, tên miền cũng chia 50% như Hosting.
    const domainRevenue = domainRaw * shareFactor;
    return { webRevenue, hostRevenue, domainRevenue,
      revenue: webRevenue + hostRevenue + domainRevenue };
  }

  function calculateSalary(items = contracts, policy = config) {
    const details = items.map(item => ({ ...item, ...calculateContract(item, policy) }));
    const sum = key => details.reduce((total, row) => total + row[key], 0);
    const webRevenue = sum('webRevenue');
    const hostRevenue = sum('hostRevenue');
    const domainRevenue = sum('domainRevenue');
    const revenue = webRevenue + hostRevenue + domainRevenue;
    const tier = [...policy.salaryLevels].sort((a, b) => a.minRevenue - b.minRevenue)
      .filter(level => revenue >= level.minRevenue).at(-1) || policy.salaryLevels[0];
    const webCommission = webRevenue * tier.webRate / 100;
    const hostCommission = hostRevenue * tier.hostRate / 100;
    const domainCommission = domainRevenue * DOMAIN_RATE;
    const commission = webCommission + hostCommission + domainCommission;
    const grossSalary = tier.base + commission;
    const deduction = revenue <= TAX_FREE_REVENUE ? 0 : grossSalary * INCOME_DEDUCTION;
    const salary = grossSalary - deduction;
    return { details, webRevenue, hostRevenue, domainRevenue, revenue, tier,
      webCommission, hostCommission, domainCommission, commission,
      grossSalary, deduction, salary };
  }

  /** Bổ sung trường mới bằng JavaScript để chỉ phải thay một file. */
  function addInterfaceExtensions() {
    const formGrid = $('#contractTemplate').content.querySelector('.form-grid');
    const domainLabel = document.createElement('label');
    domainLabel.className = 'field';
    domainLabel.innerHTML = '<span>Tên miền <em>(giá khách đã +8%)</em></span>';
    const domainSelect = document.createElement('select');
    domainSelect.className = 'domain-select';
    [['', 'Không có tên miền'], ...DOMAIN_OPTIONS.map(d => [d.id, `${d.name} · ${money(d.displayPrice)}`])]
      .forEach(([value, title]) => {
        const option = document.createElement('option');
        option.value = value; option.textContent = title; domainSelect.append(option);
      });
    domainLabel.append(domainSelect);
    formGrid.append(domainLabel);

    // Đổi chú thích tại chỗ (không đụng HTML hay CSS cũ).
    $('#totalRevenue').nextElementSibling.textContent = 'Web + Hosting + tên miền (giá gốc)';
    $('#totalCommission').nextElementSibling.textContent = 'Hoa hồng Web, Hosting & tên miền';
    const hostField = $('#contractTemplate').content.querySelector('.custom-host-field');
    hostField.querySelector('span').innerHTML = 'Giá Hosting tự nhập <em>(giá đã +8%, VNĐ)</em>';
    const note = document.createElement('small');
    note.textContent = 'Giá khách thấy đã +8%; doanh thu tính lương sẽ tự chia 1,08.';
    note.style.cssText = 'color:#71809a;font-size:11px;line-height:1.6';
    hostField.append(note);

    const breakdown = $('.breakdown');
    const appendRow = (anchorSelector, id, title) => {
      const row = document.createElement('div');
      row.innerHTML = `<span>${title}</span><strong id="${id}">0 đ</strong>`;
      breakdown.querySelector(anchorSelector).before(row);
    };
    appendRow('#baseSalary', 'domainRevenue', 'Doanh thu tên miền (giá gốc)');
    appendRow('.final-row', 'domainCommission', 'Hoa hồng tên miền (5%)');
    appendRow('.final-row', 'grossSalary', 'Tổng lương trước khấu trừ');
    appendRow('.final-row', 'incomeDeduction', 'Khấu trừ thu nhập (10%)');
    $('.final-row span').textContent = 'Lương thực nhận';
    const explanation = $('.explain p');
    explanation.textContent = 'Web chưa bàn giao tính 50%. Hợp đồng chia sẻ tính 50% cho Web, Hosting và tên miền. Giá Hosting/tên miền hiển thị đã cộng 8%, doanh thu tính lương dùng giá gốc. Tên miền hưởng 5% hoa hồng. Doanh thu ghi nhận trên 5 triệu: khấu trừ 10% trên tổng lương trước khấu trừ.';
    $('footer').textContent = 'Dữ liệu lưu trên trình duyệt, không gửi lên máy chủ. Khấu trừ 10% là quy tắc tính lương bạn cung cấp, không phải kết luận về nghĩa vụ thuế theo pháp luật.';
    // Chú thích trong cài đặt: giá Hosting lưu dưới dạng giá gốc.
    $('#hostingSettings .muted').textContent = 'Nhập GIÁ GỐC Hosting (chưa cộng 8%) như trước. Ứng dụng tự hiển thị giá niêm yết +8% khi chọn gói.';
    $('#hostingSettings th:nth-child(2)').textContent = 'Giá gốc (VNĐ, chưa +8%)';
  }

  function refreshSummary() {
    const result = calculateSalary();
    const set = (id, value) => { $(id).textContent = value; };
    set('#totalSalary', money(result.salary));
    set('#totalRevenue', money(result.revenue));
    set('#totalCommission', money(result.commission));
    set('#contractCount', contracts.length);
    set('#handoverCount', `${contracts.filter(c => c.handover).length} hợp đồng đã bàn giao`);
    set('#tierName', `Lương cơ bản ${money(result.tier.base)}`);
    set('#tierLabel', `Từ ${money(result.tier.minRevenue)}`);
    set('#tierRates', `Web ${result.tier.webRate}% · Hosting ${result.tier.hostRate}%`);
    set('#webRevenue', money(result.webRevenue));
    set('#hostRevenue', money(result.hostRevenue));
    set('#domainRevenue', money(result.domainRevenue));
    set('#domainCommission', money(result.domainCommission));
    set('#grossSalary', money(result.grossSalary));
    set('#incomeDeduction', result.deduction ? `− ${money(result.deduction)}` : '0 đ (miễn)');
    set('#baseSalary', money(result.tier.base));
    set('#webCommission', money(result.webCommission));
    set('#hostCommission', money(result.hostCommission));
    set('#salaryBreakdown', money(result.salary));
    document.querySelectorAll('.contract-card').forEach((card, index) => {
      card.querySelector('.contract-total strong').textContent = money(result.details[index].revenue);
      card.querySelector('.contract-subtitle').textContent = result.details[index].revenue ? 'Đã tính vào tổng doanh thu' : 'Chưa có doanh thu ghi nhận';
    });
    persist();
  }

  function hostOptions(selected) {
    const options = [['', 'Chọn gói Hosting (không bắt buộc)'],
      ...config.hostingOptions.map(h => [h.id, `${h.name} · ${money(priceWithMarkup(h.price))}`]), ['custom','Tự nhập giá Hosting']];
    const select = document.createElement('select');
    select.className = 'host-select';
    options.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value; option.textContent = label; select.append(option);
    });
    select.value = options.some(o => o[0] === selected) ? selected : '';
    return select;
  }

  function renderContracts() {
    const root = $('#contracts'); root.replaceChildren();
    contracts.forEach((contract, index) => {
      const card = $('#contractTemplate').content.firstElementChild.cloneNode(true);
      card.dataset.id = contract.id;
      card.querySelector('.contract-number').textContent = String(index + 1).padStart(2, '0');
      card.querySelector('h3').textContent = `Hợp đồng ${String(index + 1).padStart(2, '0')}`;
      card.querySelector('.web-amount').value = contract.webMillions;
      const oldSelect = card.querySelector('.host-select');
      oldSelect.replaceWith(hostOptions(contract.hostId));
      card.querySelector('.custom-host').value = contract.customHost;
      // card.querySelector('.domain-select').value = contract.domainId || '';
      
const domainSelect = card.querySelector('.domain-select');

domainSelect.value = contract.domainId || '';

domainSelect.addEventListener('change', () => {
  const current = contracts.find(
    item => item.id === card.dataset.id
  );

  if (!current) return;

  current.domainId = domainSelect.value;
  refreshSummary();
});

      
      card.querySelector('.custom-host-field').hidden = contract.hostId !== 'custom';
      card.querySelector('.handover').checked = !!contract.handover;
      card.querySelector('.shared').checked = !!contract.shared;
      card.querySelector('.delete-contract').disabled = contracts.length === 1;
      card.querySelector('.delete-contract').style.visibility = contracts.length === 1 ? 'hidden' : 'visible';
      root.append(card);
    });
    refreshSummary();
  }

  function bindContractEvents() {
    $('#contracts').addEventListener('input', event => updateContract(event));
    $('#contracts').addEventListener('change', event => updateContract(event));
    $('#contracts').addEventListener('click', event => {
      const button = event.target.closest('.delete-contract');
      if (!button || contracts.length <= 1) return;
      contracts = contracts.filter(item => item.id !== button.closest('.contract-card').dataset.id);
      renderContracts();
    });
    const add = () => { contracts.push(freshContract()); renderContracts(); $('#contracts').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    $('#addContract').addEventListener('click', add);
    $('#addContractBottom').addEventListener('click', add);
    $('#resetContracts').addEventListener('click', () => {
      if (!confirm('Xóa toàn bộ hợp đồng đã nhập? Bảng giá và chính sách lương vẫn được giữ lại.')) return;
      contracts = [freshContract()]; renderContracts();
    });
  }

  function updateContract(event) {
    const field = event.target;
    const card = field.closest('.contract-card');
    if (!card) return;
    const contract = contracts.find(item => item.id === card.dataset.id);
    if (!contract) return;
    if (field.matches('.web-amount')) contract.webMillions = field.value;
    else if (field.matches('.host-select')) {
      contract.hostId = field.value;
      card.querySelector('.custom-host-field').hidden = field.value !== 'custom';
    } else if (field.matches('.custom-host')) contract.customHost = field.value;
    else if (field.matches('.handover')) contract.handover = field.checked;
    else if (field.matches('.shared')) contract.shared = field.checked;
    else if (field.matches('.domain-select')) contract.domainId = field.value;
    else return;
    refreshSummary();
  }

  // Bảng giá và bậc lương được thao tác với bản nháp; chỉ cập nhật khi bấm Lưu.
  function settingsRow(values, type) {
    const row = document.createElement('tr');
    row.dataset.id = values.id || '';
    const entries = type === 'hosting'
      ? [['name', values.name, 'text'], ['price', values.price, 'number']]
      : [['minRevenue', values.minRevenue, 'number'], ['base', values.base, 'number'],
        ['webRate', values.webRate, 'number'], ['hostRate', values.hostRate, 'number']];
    entries.forEach(([key, value, inputType]) => {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.dataset.key = key; input.type = inputType; input.value = value;
      if (inputType === 'number') { input.min = '0'; input.step = 'any'; }
      input.setAttribute('aria-label', key);
      cell.append(input); row.append(cell);
    });
    const removeCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.className = 'remove-row'; remove.type = 'button'; remove.textContent = '✕';
    remove.title = 'Xóa dòng'; remove.setAttribute('aria-label', 'Xóa dòng');
    remove.addEventListener('click', () => row.remove());
    removeCell.append(remove); row.append(removeCell);
    return row;
  }
  function renderSettings() {
    $('#hostingRows').replaceChildren(...settingsDraft.hostingOptions.map(row => settingsRow(row, 'hosting')));
    $('#salaryRows').replaceChildren(...settingsDraft.salaryLevels.map(row => settingsRow(row, 'salary')));
    $('#settingsError').hidden = true;
  }
  function openSettings() {
    settingsDraft = clone(config);
    renderSettings();
    showTab('hosting');
    $('#settingsDialog').showModal();
  }
  function showTab(tab) {
    $('#hostingSettings').hidden = tab !== 'hosting';
    $('#salarySettings').hidden = tab !== 'salary';
    document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  }
  function readRows(selector, type) {
    return [...document.querySelectorAll(`${selector} tr`)].map((row, index) => {
      const result = {};
      row.querySelectorAll('input').forEach(input => {
        result[input.dataset.key] = input.type === 'number' ? Number(input.value) : input.value.trim();
        if (input.type === 'number' && (!input.value.trim() || !Number.isFinite(Number(input.value)) || Number(input.value) < 0)) {
          throw new Error('Vui lòng nhập số hợp lệ, không âm và không để trống.');
        }
      });
      if (type === 'hosting') {
        if (!result.name) throw new Error('Tên gói Hosting không được để trống.');
        result.id = row.dataset.id || `host-${Date.now()}-${index}`;
      }
      return result;
    });
  }
  function saveSettings() {
    try {
      const hostingOptions = readRows('#hostingRows', 'hosting');
      const salaryLevels = readRows('#salaryRows', 'salary').sort((a,b) => a.minRevenue - b.minRevenue);
      if (!salaryLevels.length || salaryLevels[0].minRevenue !== 0) throw new Error('Phải có bậc lương bắt đầu từ doanh thu 0 đ.');
      if (new Set(salaryLevels.map(row => row.minRevenue)).size !== salaryLevels.length) throw new Error('Các bậc lương không được trùng ngưỡng doanh thu.');
      if (salaryLevels.some(row => row.webRate > 100 || row.hostRate > 100)) throw new Error('Tỷ lệ hoa hồng không được vượt quá 100%.');
      if (new Set(hostingOptions.map(row => row.name.toLowerCase())).size !== hostingOptions.length) throw new Error('Tên gói Hosting không được trùng.');
      // Không để hợp đồng tham chiếu tới gói đã bị xóa.
      const remaining = new Set(hostingOptions.map(row => row.id));
      contracts.forEach(contract => { if (contract.hostId && contract.hostId !== 'custom' && !remaining.has(contract.hostId)) contract.hostId = ''; });
      config = { hostingOptions, salaryLevels };
      $('#settingsDialog').close();
      renderContracts();
    } catch (error) { $('#settingsError').textContent = error.message; $('#settingsError').hidden = false; }
  }
  function bindSettingsEvents() {
    $('#openSettings').addEventListener('click', openSettings);
    $('#closeSettings').addEventListener('click', () => $('#settingsDialog').close());
    $('#cancelSettings').addEventListener('click', () => $('#settingsDialog').close());
    $('#settingsDialog').addEventListener('click', event => { if (event.target === $('#settingsDialog')) $('#settingsDialog').close(); });
    document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
    $('#addHosting').addEventListener('click', () => $('#hostingRows').append(settingsRow({ name: '', price: 0 }, 'hosting')));
    $('#addSalaryTier').addEventListener('click', () => $('#salaryRows').append(settingsRow({ minRevenue: 0, base: 0, webRate: 10, hostRate: 10 }, 'salary')));
    $('#saveSettings').addEventListener('click', saveSettings);
    $('#restoreSettings').addEventListener('click', () => {
      if (!confirm('Khôi phục giá Hosting và bậc lương mặc định? Các hợp đồng vẫn được giữ.')) return;
      settingsDraft = clone(DEFAULT_CONFIG); renderSettings();
    });
  }

  function csvCell(value) { return `"${String(value).replaceAll('"', '""')}"`; }
  function exportCsv() {
    const result = calculateSalary();
    const rows = [
      ['Hợp đồng','Web gốc (đ)','Gói Hosting','Hosting giá khách +8% (đ)',
        'Tên miền','Tên miền giá khách +8% (đ)','Đã bàn giao','Chia sẻ',
        'Web ghi nhận (đ)','Hosting ghi nhận (đ)','Tên miền ghi nhận (đ)','Tổng ghi nhận (đ)'],
      ...result.details.map((c, i) => {
        const hosting = config.hostingOptions.find(h => h.id === c.hostId);
        const domain = DOMAIN_OPTIONS.find(d => d.id === c.domainId);
        return [i + 1, safeNumber(c.webMillions) * 1000000,
          c.hostId === 'custom' ? 'Tự nhập' : (hosting?.name || 'Không có'),
          c.hostId === 'custom' ? safeNumber(c.customHost) : priceWithMarkup(hosting?.price),
          domain?.name || 'Không có', domain?.displayPrice || 0,
          c.handover ? 'Có' : 'Không', c.shared ? 'Có' : 'Không',
          c.webRevenue, c.hostRevenue, c.domainRevenue, c.revenue];
      }),
      [], ['Tổng doanh thu ghi nhận', result.revenue],
      ['Doanh thu Web', result.webRevenue], ['Doanh thu Hosting', result.hostRevenue],
      ['Doanh thu tên miền', result.domainRevenue],
      ['Bậc doanh thu từ', result.tier.minRevenue], ['Lương cơ bản', result.tier.base],
      ['Hoa hồng Web (%)', result.tier.webRate], ['Hoa hồng Hosting (%)', result.tier.hostRate],
      ['Hoa hồng tên miền (%)', DOMAIN_RATE * 100],
      ['Tiền hoa hồng Web', result.webCommission],
      ['Tiền hoa hồng Hosting', result.hostCommission],
      ['Tiền hoa hồng tên miền', result.domainCommission],
      ['Tổng lương trước khấu trừ', result.grossSalary],
      ['Khấu trừ thu nhập 10%', result.deduction],
      ['LƯƠNG THỰC NHẬN', result.salary]
    ];
    const text = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bang-ke-luong-doanh-thu.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  addInterfaceExtensions();
  bindContractEvents();
  bindSettingsEvents();
  $('#exportCsv').addEventListener('click', exportCsv);
  renderContracts();
})();
