const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');

const EV_KEY = 1;
const KEY_ENTER = 28;
const KEY_LEFTSHIFT = 42;
const KEY_RIGHTSHIFT = 54;
const EVENT_SIZE = 24;
const BUFFER_TIMEOUT_MS = 500;

const KEY_MAP = {
  2:'1',3:'2',4:'3',5:'4',6:'5',7:'6',8:'7',9:'8',10:'9',11:'0',
  12:'-',13:'=',
  16:'q',17:'w',18:'e',19:'r',20:'t',21:'y',22:'u',23:'i',24:'o',25:'p',
  26:'[',27:']',
  30:'a',31:'s',32:'d',33:'f',34:'g',35:'h',36:'j',37:'k',38:'l',
  39:';',40:"'",
  43:'\\',
  44:'z',45:'x',46:'c',47:'v',48:'b',49:'n',50:'m',
  51:',',52:'.',53:'/',
  57:' ',
};

const SHIFT_MAP = {
  2:'!',3:'@',4:'#',5:'$',6:'%',7:'^',8:'&',9:'*',10:'(',11:')',
  12:'_',13:'+',
  16:'Q',17:'W',18:'E',19:'R',20:'T',21:'Y',22:'U',23:'I',24:'O',25:'P',
  26:'{',27:'}',
  30:'A',31:'S',32:'D',33:'F',34:'G',35:'H',36:'J',37:'K',38:'L',
  39:':',40:'"',
  43:'|',
  44:'Z',45:'X',46:'C',47:'V',48:'B',49:'N',50:'M',
  51:'<',52:'>',53:'?',
};

// EVIOCGRAB ioctl to exclusively capture the input device
// _IOW('E', 0x90, int) = 0x40044590
const GRAB_HELPER = `
import sys, os, fcntl
EVIOCGRAB = 0x40044590
try:
    fd = os.open(sys.argv[1], os.O_RDONLY)
    fcntl.ioctl(fd, EVIOCGRAB, 1)
except Exception as e:
    sys.stderr.write("GRAB_FAIL:" + str(e) + "\\n")
    sys.stderr.flush()
    sys.exit(1)
sys.stderr.write("GRAB_OK\\n")
sys.stderr.flush()
while True:
    try:
        data = os.read(fd, 24 * 64)
    except OSError:
        break
    if not data:
        break
    os.write(1, data)
`;

class BarcodeScanner extends EventEmitter {
  constructor() {
    super();
    this._buffer = '';
    this._shift = false;
    this._child = null;
    this._devicePath = null;
    this._connected = false;
    this._watchTimer = null;
    this._bufferTimer = null;
  }

  get connected() { return this._connected; }
  get devicePath() { return this._devicePath; }

  start() {
    const device = this._findDevice();
    if (device) {
      this._devicePath = device;
      this._open();
    } else {
      console.log('[Scanner] No barcode scanner detected. Set SCANNER_DEVICE env var or plug in scanner.');
      this._startWatching();
    }

    process.on('exit', () => this.stop());
  }

  stop() {
    clearInterval(this._watchTimer);
    clearTimeout(this._bufferTimer);
    if (this._child) {
      this._child.kill('SIGTERM');
      this._child = null;
    }
    this._connected = false;
  }

  getStatus() {
    return {
      connected: this._connected,
      devicePath: this._devicePath,
      availableDevices: this._listDevices(),
    };
  }

  _findDevice() {
    const envDevice = process.env.SCANNER_DEVICE;
    if (envDevice && envDevice !== 'auto') {
      if (fs.existsSync(envDevice)) {
        console.log(`[Scanner] Using device from env: ${envDevice}`);
        return envDevice;
      }
      console.warn(`[Scanner] SCANNER_DEVICE=${envDevice} not found`);
    }

    const byIdDir = '/dev/input/by-id';
    if (!fs.existsSync(byIdDir)) return null;

    let entries;
    try {
      entries = fs.readdirSync(byIdDir)
        .filter(name => name.includes('-event-kbd') && name.startsWith('usb-'));
    } catch { return null; }

    if (entries.length === 0) return null;

    if (entries.length === 1) {
      const p = path.join(byIdDir, entries[0]);
      console.log(`[Scanner] Auto-detected device: ${entries[0]}`);
      return p;
    }

    const scanner = entries.find(name =>
      /barcode|scanner|hid/i.test(name) && !/keyboard/i.test(name)
    ) || entries.find(name => !/keyboard/i.test(name));

    if (scanner) {
      console.log(`[Scanner] Auto-detected device: ${scanner}`);
      return path.join(byIdDir, scanner);
    }

    console.log('[Scanner] Multiple USB keyboard devices found:', entries);
    console.log('[Scanner] Set SCANNER_DEVICE env var to select the correct one');
    return null;
  }

  _listDevices() {
    const byIdDir = '/dev/input/by-id';
    if (!fs.existsSync(byIdDir)) return [];
    try {
      return fs.readdirSync(byIdDir)
        .filter(name => name.includes('-event-') && name.startsWith('usb-'))
        .map(name => ({
          name,
          path: path.join(byIdDir, name),
          isKbd: name.includes('-event-kbd'),
        }));
    } catch { return []; }
  }

  _open() {
    if (this._child) {
      this._child.kill('SIGTERM');
      this._child = null;
    }

    const child = spawn('python3', ['-u', '-c', GRAB_HELPER, this._devicePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this._child = child;

    let remainder = Buffer.alloc(0);

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      for (const line of msg.split('\n')) {
        if (line === 'GRAB_OK') {
          console.log(`[Scanner] Connected (exclusive grab): ${this._devicePath}`);
          this._connected = true;
          this.emit('status', { connected: true, devicePath: this._devicePath });
        } else if (line.startsWith('GRAB_FAIL')) {
          console.error(`[Scanner] Exclusive grab failed: ${line}`);
        }
      }
    });

    child.stdout.on('data', (chunk) => {
      const data = Buffer.concat([remainder, chunk]);
      let offset = 0;
      while (offset + EVENT_SIZE <= data.length) {
        const type = data.readUInt16LE(offset + 16);
        const code = data.readUInt16LE(offset + 18);
        const value = data.readInt32LE(offset + 20);
        if (type === EV_KEY) {
          this._handleKey(code, value);
        }
        offset += EVENT_SIZE;
      }
      remainder = data.subarray(offset);
    });

    child.on('error', (err) => {
      console.error(`[Scanner] Process error: ${err.message}`);
      this._disconnect();
    });

    child.on('close', (code) => {
      this._child = null;
      this._disconnect();
    });
  }

  _handleKey(code, value) {
    if (code === KEY_LEFTSHIFT || code === KEY_RIGHTSHIFT) {
      this._shift = value > 0;
      return;
    }
    if (value !== 1) return;

    if (code === KEY_ENTER) {
      clearTimeout(this._bufferTimer);
      if (this._buffer) {
        const barcode = this._buffer.trim();
        this._buffer = '';
        if (barcode) {
          console.log(`[Scanner] Scanned: ${barcode}`);
          this.emit('scan', barcode);
        }
      }
      return;
    }

    const char = this._shift ? SHIFT_MAP[code] : KEY_MAP[code];
    if (char) {
      this._buffer += char;
      clearTimeout(this._bufferTimer);
      this._bufferTimer = setTimeout(() => {
        this._buffer = '';
      }, BUFFER_TIMEOUT_MS);
    }
  }

  _disconnect() {
    if (this._child) {
      this._child.kill('SIGTERM');
      this._child = null;
    }
    if (this._connected) {
      console.log('[Scanner] Disconnected');
      this._connected = false;
      this.emit('status', { connected: false, devicePath: this._devicePath });
    }
    this._buffer = '';
    this._shift = false;
    this._startWatching();
  }

  _startWatching() {
    clearInterval(this._watchTimer);
    this._watchTimer = setInterval(() => {
      if (this._connected) return;
      const device = this._findDevice();
      if (device) {
        clearInterval(this._watchTimer);
        this._devicePath = device;
        this._open();
      }
    }, 3000);
  }
}

module.exports = BarcodeScanner;
