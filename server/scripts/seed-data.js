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

// Each category: models per brand as [name, base price in USD, options?].
// variants: [label, sku code, price added, price multiplier]; a model with
// { single: true } has no variants. qty: usual quantity range on one order line.
// popularity: relative share of sales. minStock: lowest reorder level.
export const catalog = [
  {
    code: 'LAP', name: 'Laptops', description: 'Business, everyday and gaming laptops',
    unit: 'pcs', qty: [1, 3], popularity: 0.7, minStock: 4,
    variants: [['8GB/256GB', '8-256', 0, 1], ['16GB/512GB', '16-512', 180, 1], ['32GB/1TB', '32-1T', 450, 1]],
    brands: {
      Dell: [['XPS 13', 1099], ['Inspiron 15', 649], ['Latitude 5440', 899]],
      HP: [['Pavilion 15', 629], ['EliteBook 840', 1049], ['Envy x360 14', 899]],
      Lenovo: [['ThinkPad E14', 749], ['IdeaPad Slim 5', 679], ['Legion 5', 1199]],
      Asus: [['Zenbook 14', 899], ['Vivobook 15', 549], ['ROG Strix G16', 1399]],
      Acer: [['Aspire 5', 529], ['Swift Go 14', 749], ['Nitro V 15', 899]],
      Apple: [['MacBook Air 13 M3', 1099], ['MacBook Pro 14 M3', 1599]],
    },
  },
  {
    code: 'MON', name: 'Monitors', description: 'Office, gaming and professional displays',
    unit: 'pcs', qty: [1, 4], popularity: 0.8, minStock: 6,
    brands: {
      Dell: [['P2423 24" FHD', 219], ['S2722DC 27" QHD', 299], ['U3223QE 32" 4K', 849]],
      LG: [['24MP400 24" FHD', 129], ['27GP850 27" QHD 165Hz', 379], ['32UN880 32" 4K Ergo', 649]],
      Samsung: [['Odyssey G5 27" QHD', 289], ['ViewFinity S8 27" 4K', 449], ['Smart Monitor M7 32"', 399]],
      Asus: [['ProArt PA248QV 24"', 239], ['TUF Gaming VG27AQ 27"', 299]],
      ViewSonic: [['VA2432 24" FHD', 119], ['VX2758 27" 144Hz', 199]],
    },
  },
  {
    code: 'KBM', name: 'Keyboards & Mice', description: 'Keyboards, mice and combos',
    unit: 'pcs', qty: [1, 6], popularity: 1.6, minStock: 15,
    variants: [['Black', 'BLK', 0, 1], ['White', 'WHT', 5, 1]],
    brands: {
      Logitech: [
        ['MX Master 3S Mouse', 99], ['MX Keys S Keyboard', 109], ['M185 Wireless Mouse', 15],
        ['K380 Bluetooth Keyboard', 39], ['G502 Hero Gaming Mouse', 49], ['MK270 Wireless Combo', 35, { single: true, unit: 'set' }],
      ],
      Razer: [['DeathAdder V3 Mouse', 69], ['BlackWidow V4 Keyboard', 169]],
      Corsair: [['K70 RGB Pro Keyboard', 159], ['Harpoon RGB Mouse', 29]],
      Microsoft: [['Bluetooth Mouse', 24], ['Ergonomic Keyboard', 59]],
      Akko: [['3068B Plus Keyboard', 89], ['5075B Plus Keyboard', 109]],
    },
  },
  {
    code: 'STO', name: 'Storage', description: 'SSDs, hard drives and portable storage',
    unit: 'pcs', qty: [1, 6], popularity: 1.2, minStock: 10,
    variants: [['500GB', '500G', 0, 1], ['1TB', '1T', 0, 1.7], ['2TB', '2T', 0, 3]],
    brands: {
      Samsung: [['870 EVO SATA SSD', 59], ['990 PRO NVMe SSD', 89], ['T7 Portable SSD', 79]],
      Kingston: [['NV2 NVMe SSD', 39], ['A400 SATA SSD', 35]],
      WD: [['Blue SN580 NVMe SSD', 49], ['My Passport Portable HDD', 55]],
      Seagate: [['BarraCuda Internal HDD', 45]],
      SanDisk: [['Extreme Portable SSD', 85]],
    },
  },
  {
    code: 'NET', name: 'Networking', description: 'Routers, mesh Wi-Fi, switches and access points',
    unit: 'pcs', qty: [1, 5], popularity: 0.6, minStock: 6,
    brands: {
      'TP-Link': [
        ['Archer AX55 Wi-Fi 6 Router', 99], ['Deco X50 Mesh (3-pack)', 249, { unit: 'set' }],
        ['TL-SG108 8-Port Switch', 25], ['TL-SG1024D 24-Port Switch', 89], ['EAP610 Access Point', 109],
      ],
      Ubiquiti: [['UniFi U6 Lite Access Point', 99], ['UniFi Dream Machine', 299], ['UniFi Switch Lite 8 PoE', 109]],
      Netgear: [['Nighthawk RAX50 Router', 229], ['GS308 8-Port Switch', 29]],
      Asus: [['RT-AX58U Router', 139], ['ZenWiFi XT8 (2-pack)', 399, { unit: 'set' }]],
    },
  },
  {
    code: 'CBL', name: 'Cables & Adapters', description: 'Cables, hubs, chargers and adapters',
    unit: 'pcs', qty: [2, 20], popularity: 2.2, minStock: 30,
    variants: [['1m', '1M', 0, 1], ['2m', '2M', 3, 1], ['3m', '3M', 5, 1]],
    brands: {
      Ugreen: [
        ['USB-C to USB-C Cable 100W', 9], ['HDMI 2.1 Cable 8K', 12], ['USB-C to HDMI Cable', 15],
        ['USB-C 7-in-1 Hub', 39, { single: true }], ['USB-C Cable 1m (Box of 10)', 65, { single: true, unit: 'box' }],
      ],
      Anker: [['PowerLine III USB-C Cable', 13], ['USB-C to Lightning Cable', 15], ['65W GaN Charger', 45, { single: true }]],
      Belkin: [['Cat6 Ethernet Cable', 7], ['DisplayPort 1.4 Cable', 14], ['Cat6 Cable Roll 305m', 119, { single: true, unit: 'roll' }]],
      Baseus: [['USB-C Fast Charging Cable', 8]],
    },
  },
  {
    code: 'AUD', name: 'Audio', description: 'Headphones, headsets and speakers',
    unit: 'pcs', qty: [1, 5], popularity: 0.9, minStock: 8,
    variants: [['Black', 'BLK', 0, 1], ['White', 'WHT', 0, 1]],
    brands: {
      Sony: [['WH-1000XM5 Headphones', 399], ['WF-1000XM5 Earbuds', 299]],
      JBL: [['Flip 6 Speaker', 129], ['Tune 520BT Headphones', 49]],
      Logitech: [['H390 USB Headset', 29], ['Z313 Speaker System', 49, { single: true, unit: 'set' }]],
      HyperX: [['Cloud III Headset', 99], ['Cloud Stinger 2 Headset', 49]],
      Jabra: [['Evolve2 65 Headset', 229]],
    },
  },
  {
    code: 'CMP', name: 'Components', description: 'Graphics cards, processors, memory and more',
    unit: 'pcs', qty: [1, 4], popularity: 0.7, minStock: 4,
    brands: {
      Kingston: [['Fury Beast DDR5 16GB', 59], ['Fury Beast DDR5 32GB (2x16GB)', 109, { unit: 'set' }]],
      Corsair: [['Vengeance DDR5 32GB (2x16GB)', 119, { unit: 'set' }], ['RM850x 850W PSU', 139]],
      Asus: [['Dual RTX 4060 8GB', 299], ['TUF RTX 4070 Super 12GB', 649], ['ROG Strix RTX 4090 24GB', 1999]],
      MSI: [['RTX 4060 Ti Ventus 8GB', 399], ['MAG B650 Tomahawk Motherboard', 219]],
      Gigabyte: [['RTX 4070 Windforce 12GB', 579], ['B760M DS3H Motherboard', 129]],
      Intel: [['Core i5-14400F', 199], ['Core i7-14700K', 399]],
      AMD: [['Ryzen 5 7600', 219], ['Ryzen 7 7800X3D', 449]],
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
