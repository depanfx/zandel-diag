const DEVICE_LABELS = {
  android:        'Android',
  iphone:         'iPhone',
  ipad:           'iPad',
  laptop_windows: 'Laptop (Windows)',
  laptop_linux:   'Laptop (Linux)',
  macbook:        'MacBook',
};

const VALID_DEVICE_TYPES = Object.keys(DEVICE_LABELS);

module.exports = { DEVICE_LABELS, VALID_DEVICE_TYPES };
