// Reference data for scripts/seed.js: a fictional electronics & computer accessories
// distributor. Product brands are real; suppliers, customers and people are made up.

export const DEMO_PASSWORD = 'demo1234';

export const demoUsers = [
  { email: 'admin@stockflow.demo', name: 'Admin', role: 'admin' },
  { email: 'manager@stockflow.demo', name: 'Nguyen Van A', role: 'manager' },
  { email: 'staff@stockflow.demo', name: 'Bui Van B', role: 'staff' },
  { email: 'staff2@stockflow.demo', name: 'Do Van C', role: 'staff' },
];

// share: fraction of customers (and so of sales) located near this warehouse.
export const warehouses = [
  { code: 'HN', name: 'Hanoi Warehouse', city: 'Hanoi', address: '12 Pham Van Dong, Bac Tu Liem, Hanoi', share: 0.4 },
  { code: 'HCM', name: 'Ho Chi Minh City Warehouse', city: 'Ho Chi Minh City', address: '45 Nguyen Van Linh, District 7, Ho Chi Minh City', share: 0.45 },
  { code: 'DN', name: 'Da Nang Warehouse', city: 'Da Nang', address: '88 Dien Bien Phu, Thanh Khe, Da Nang', share: 0.15 },
];

export const suppliers = [
  { name: 'Sao Viet Distribution', brands: ['Dell', 'HP', 'Lenovo'] },
  { name: 'Mekong Computer Supply', brands: ['Asus', 'Acer', 'MSI', 'Gigabyte'] },
  { name: 'Lotus Digital Trading', brands: ['Apple', 'Samsung', 'LG'] },
  { name: 'Red River Peripherals', brands: ['Logitech', 'Razer', 'Corsair', 'Microsoft', 'Akko', 'HyperX'] },
  { name: 'Pacific Storage Solutions', brands: ['Kingston', 'WD', 'Seagate', 'SanDisk'] },
  { name: 'Blue Ocean Networks', brands: ['TP-Link', 'Ubiquiti', 'Netgear'] },
  { name: 'Golden Bridge Accessories', brands: ['Ugreen', 'Anker', 'Belkin', 'Baseus'] },
  { name: 'Harmony Audio Distribution', brands: ['Sony', 'JBL', 'Jabra'] },
  { name: 'Saigon Silicon Components', brands: ['Intel', 'AMD', 'ViewSonic'] },
];

// Short brand codes used in SKUs.
export const brandCodes = {
  Acer: 'ACER', AMD: 'AMD', Akko: 'AKKO', Anker: 'ANKER', Apple: 'APPLE', Asus: 'ASUS', Baseus: 'BASEUS',
  Belkin: 'BELKIN', Corsair: 'CORSAIR', Dell: 'DELL', Gigabyte: 'GIGA', HP: 'HP', HyperX: 'HYPERX', Intel: 'INTEL',
  Jabra: 'JABRA', JBL: 'JBL', Kingston: 'KING', Lenovo: 'LENOVO', LG: 'LG', Logitech: 'LOGI', Microsoft: 'MS',
  MSI: 'MSI', Netgear: 'NETGEAR', Razer: 'RAZER', Samsung: 'SAMSUNG', SanDisk: 'SANDISK', Seagate: 'SEAGATE',
  Sony: 'SONY', 'TP-Link': 'TPLINK', Ubiquiti: 'UBNT', Ugreen: 'UGREEN', ViewSonic: 'VSONIC', WD: 'WD',
};

// Each category: models per brand as [name, base price in USD, model code, options?].
// SKU = category code - brand code - model code - variant code, e.g. LAP-DELL-XPS13-16-512.
// variants: [label, sku code, price added, price multiplier]; a model with
// { single: true } has no variants. qty: usual quantity range on one order line.
// popularity: relative share of sales. minStock: lowest reorder level.
export const catalog = [
  {
    code: 'LAP', name: 'Laptops', description: 'Business, everyday and gaming laptops',
    unit: 'pcs', qty: [1, 3], popularity: 0.7, minStock: 4,
    variants: [['8GB/256GB', '8-256', 0, 1], ['16GB/512GB', '16-512', 180, 1], ['32GB/1TB', '32-1T', 450, 1]],
    brands: {
      Dell: [['XPS 13', 1099, 'XPS13'], ['Inspiron 15', 649, 'INS15'], ['Latitude 5440', 899, 'LAT5440']],
      HP: [['Pavilion 15', 629, 'PAV15'], ['EliteBook 840', 1049, 'EB840'], ['Envy x360 14', 899, 'ENVYX360']],
      Lenovo: [['ThinkPad E14', 749, 'TPE14'], ['IdeaPad Slim 5', 679, 'IPSLIM5'], ['Legion 5', 1199, 'LEGION5']],
      Asus: [['Zenbook 14', 899, 'ZEN14'], ['Vivobook 15', 549, 'VIVO15'], ['ROG Strix G16', 1399, 'ROGG16']],
      Acer: [['Aspire 5', 529, 'ASPIRE5'], ['Swift Go 14', 749, 'SWIFTGO14'], ['Nitro V 15', 899, 'NITROV15']],
      Apple: [['MacBook Air 13 M3', 1099, 'MBA13M3'], ['MacBook Pro 14 M3', 1599, 'MBP14M3']],
    },
  },
  {
    code: 'MON', name: 'Monitors', description: 'Office, gaming and professional displays',
    unit: 'pcs', qty: [1, 4], popularity: 0.8, minStock: 6,
    brands: {
      Dell: [['P2423 24" FHD', 219, 'P2423'], ['S2722DC 27" QHD', 299, 'S2722DC'], ['U3223QE 32" 4K', 849, 'U3223QE']],
      LG: [['24MP400 24" FHD', 129, '24MP400'], ['27GP850 27" QHD 165Hz', 379, '27GP850'], ['32UN880 32" 4K Ergo', 649, '32UN880']],
      Samsung: [['Odyssey G5 27" QHD', 289, 'G5-27'], ['ViewFinity S8 27" 4K', 449, 'S8-27'], ['Smart Monitor M7 32"', 399, 'M7-32']],
      Asus: [['ProArt PA248QV 24"', 239, 'PA248QV'], ['TUF Gaming VG27AQ 27"', 299, 'VG27AQ']],
      ViewSonic: [['VA2432 24" FHD', 119, 'VA2432'], ['VX2758 27" 144Hz', 199, 'VX2758']],
    },
  },
  {
    code: 'KBM', name: 'Keyboards & Mice', description: 'Keyboards, mice and combos',
    unit: 'pcs', qty: [1, 6], popularity: 1.6, minStock: 15,
    variants: [['Black', 'BLK', 0, 1], ['White', 'WHT', 5, 1]],
    brands: {
      Logitech: [
        ['MX Master 3S Mouse', 99, 'MXM3S'], ['MX Keys S Keyboard', 109, 'MXKEYS'], ['M185 Wireless Mouse', 15, 'M185'],
        ['K380 Bluetooth Keyboard', 39, 'K380'], ['G502 Hero Gaming Mouse', 49, 'G502'],
        ['MK270 Wireless Combo', 35, 'MK270', { single: true, unit: 'set' }],
      ],
      Razer: [['DeathAdder V3 Mouse', 69, 'DAV3'], ['BlackWidow V4 Keyboard', 169, 'BWV4']],
      Corsair: [['K70 RGB Pro Keyboard', 159, 'K70PRO'], ['Harpoon RGB Mouse', 29, 'HARPOON']],
      Microsoft: [['Bluetooth Mouse', 24, 'BTMOUSE'], ['Ergonomic Keyboard', 59, 'ERGOKB']],
      Akko: [['3068B Plus Keyboard', 89, '3068B'], ['5075B Plus Keyboard', 109, '5075B']],
    },
  },
  {
    code: 'STO', name: 'Storage', description: 'SSDs, hard drives and portable storage',
    unit: 'pcs', qty: [1, 6], popularity: 1.2, minStock: 10,
    variants: [['500GB', '500G', 0, 1], ['1TB', '1T', 0, 1.7], ['2TB', '2T', 0, 3]],
    brands: {
      Samsung: [['870 EVO SATA SSD', 59, '870EVO'], ['990 PRO NVMe SSD', 89, '990PRO'], ['T7 Portable SSD', 79, 'T7']],
      Kingston: [['NV2 NVMe SSD', 39, 'NV2'], ['A400 SATA SSD', 35, 'A400']],
      WD: [['Blue SN580 NVMe SSD', 49, 'SN580'], ['My Passport Portable HDD', 55, 'PASSPORT']],
      Seagate: [['BarraCuda Internal HDD', 45, 'BARRACUDA']],
      SanDisk: [['Extreme Portable SSD', 85, 'EXTREME']],
    },
  },
  {
    code: 'NET', name: 'Networking', description: 'Routers, mesh Wi-Fi, switches and access points',
    unit: 'pcs', qty: [1, 5], popularity: 0.6, minStock: 6,
    brands: {
      'TP-Link': [
        ['Archer AX55 Wi-Fi 6 Router', 99, 'AX55'], ['Deco X50 Mesh (3-pack)', 249, 'DECOX50', { unit: 'set' }],
        ['TL-SG108 8-Port Switch', 25, 'SG108'], ['TL-SG1024D 24-Port Switch', 89, 'SG1024D'], ['EAP610 Access Point', 109, 'EAP610'],
      ],
      Ubiquiti: [['UniFi U6 Lite Access Point', 99, 'U6LITE'], ['UniFi Dream Machine', 299, 'UDM'], ['UniFi Switch Lite 8 PoE', 109, 'USWLITE8']],
      Netgear: [['Nighthawk RAX50 Router', 229, 'RAX50'], ['GS308 8-Port Switch', 29, 'GS308']],
      Asus: [['RT-AX58U Router', 139, 'RTAX58U'], ['ZenWiFi XT8 (2-pack)', 399, 'XT8', { unit: 'set' }]],
    },
  },
  {
    code: 'CBL', name: 'Cables & Adapters', description: 'Cables, hubs, chargers and adapters',
    unit: 'pcs', qty: [2, 20], popularity: 2.2, minStock: 30,
    variants: [['1m', '1M', 0, 1], ['2m', '2M', 3, 1], ['3m', '3M', 5, 1]],
    brands: {
      Ugreen: [
        ['USB-C to USB-C Cable 100W', 9, 'USBC100W'], ['HDMI 2.1 Cable 8K', 12, 'HDMI21'], ['USB-C to HDMI Cable', 15, 'USBC-HDMI'],
        ['USB-C 7-in-1 Hub', 39, 'HUB7IN1', { single: true }], ['USB-C Cable 1m (Box of 10)', 65, 'USBC-1M-B10', { single: true, unit: 'box' }],
      ],
      Anker: [['PowerLine III USB-C Cable', 13, 'PL3-USBC'], ['USB-C to Lightning Cable', 15, 'USBC-LTG'], ['65W GaN Charger', 45, 'GAN65W', { single: true }]],
      Belkin: [['Cat6 Ethernet Cable', 7, 'CAT6'], ['DisplayPort 1.4 Cable', 14, 'DP14'], ['Cat6 Cable Roll 305m', 119, 'CAT6-305M', { single: true, unit: 'roll' }]],
      Baseus: [['USB-C Fast Charging Cable', 8, 'USBC-FAST']],
    },
  },
  {
    code: 'AUD', name: 'Audio', description: 'Headphones, headsets and speakers',
    unit: 'pcs', qty: [1, 5], popularity: 0.9, minStock: 8,
    variants: [['Black', 'BLK', 0, 1], ['White', 'WHT', 0, 1]],
    brands: {
      Sony: [['WH-1000XM5 Headphones', 399, 'WH1000XM5'], ['WF-1000XM5 Earbuds', 299, 'WF1000XM5']],
      JBL: [['Flip 6 Speaker', 129, 'FLIP6'], ['Tune 520BT Headphones', 49, 'T520BT']],
      Logitech: [['H390 USB Headset', 29, 'H390'], ['Z313 Speaker System', 49, 'Z313', { single: true, unit: 'set' }]],
      HyperX: [['Cloud III Headset', 99, 'CLOUD3'], ['Cloud Stinger 2 Headset', 49, 'STINGER2']],
      Jabra: [['Evolve2 65 Headset', 229, 'EVOLVE2-65']],
    },
  },
  {
    code: 'CMP', name: 'Components', description: 'Graphics cards, processors, memory and more',
    unit: 'pcs', qty: [1, 4], popularity: 0.7, minStock: 4,
    brands: {
      Kingston: [['Fury Beast DDR5 16GB', 59, 'FURY-D5-16G'], ['Fury Beast DDR5 32GB (2x16GB)', 109, 'FURY-D5-32G', { unit: 'set' }]],
      Corsair: [['Vengeance DDR5 32GB (2x16GB)', 119, 'VENG-D5-32G', { unit: 'set' }], ['RM850x 850W PSU', 139, 'RM850X']],
      Asus: [['Dual RTX 4060 8GB', 299, 'RTX4060-DUAL'], ['TUF RTX 4070 Super 12GB', 649, 'RTX4070S-TUF'], ['ROG Strix RTX 4090 24GB', 1999, 'RTX4090-ROG']],
      MSI: [['RTX 4060 Ti Ventus 8GB', 399, 'RTX4060TI'], ['MAG B650 Tomahawk Motherboard', 219, 'B650-TOMAHAWK']],
      Gigabyte: [['RTX 4070 Windforce 12GB', 579, 'RTX4070-WF'], ['B760M DS3H Motherboard', 129, 'B760M-DS3H']],
      Intel: [['Core i5-14400F', 199, 'I5-14400F'], ['Core i7-14700K', 399, 'I7-14700K']],
      AMD: [['Ryzen 5 7600', 219, 'R5-7600'], ['Ryzen 7 7800X3D', 449, 'R7-7800X3D']],
    },
  },
];

export const customerNames = {
  prefixes: [
    'Minh Phat', 'Thanh Cong', 'Hoang Long', 'Viet Tien', 'Nam Viet', 'Duc Tri', 'Tan Phu', 'Phuc An',
    'Hung Thinh', 'Bao Ngoc', 'Kim Long', 'Dai Phat', 'Thien An', 'Quang Minh', 'Hai Dang', 'Tuan Kiet',
    'Ngoc Lan', 'Sao Mai', 'Binh Minh', 'Truong Son', 'Hong Ha', 'An Khang', 'Phu Quy', 'Gia Bao',
    'Vinh Hung', 'Lac Hong', 'Song Hong', 'Cuu Long', 'Hoa Binh', 'Thai Son',
  ],
  kinds: [
    'Computer', 'Tech Store', 'Digital', 'Laptop Center', 'IT Solutions JSC', 'Trading Co.',
    'Software Ltd.', 'Office Supplies', 'Gaming Hub', 'Electronics', 'High School', 'Engineering Co.',
  ],
};

export const people = {
  family: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Vo', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly'],
  middle: ['Van', 'Thi', 'Minh', 'Duc', 'Thu', 'Ngoc', 'Quoc', 'Thanh', 'Hai', 'Gia'],
  given: ['An', 'Binh', 'Chau', 'Dung', 'Giang', 'Ha', 'Hieu', 'Hoa', 'Khanh', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Phong', 'Quan', 'Son', 'Tam', 'Trang', 'Tuan', 'Vy', 'Yen'],
};

export const streets = [
  'Le Loi', 'Tran Hung Dao', 'Nguyen Hue', 'Hai Ba Trung', 'Ly Thuong Kiet', 'Dien Bien Phu',
  'Nguyen Trai', 'Le Duan', 'Cach Mang Thang Tam', 'Hoang Dieu', 'Bach Dang', 'Quang Trung',
];

export const cancelReasons = [
  'Customer changed their mind',
  'Wrong product ordered',
  'Customer found a better price',
  'Duplicate order',
  'Payment not received',
];
