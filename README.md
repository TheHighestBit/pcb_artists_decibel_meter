# A NodeJS driver for [PCB artists I2C Decibel Sound Level Meter Module](https://pcbartists.com/product/i2c-decibel-sound-level-meter-module/)

This library uses the [i2c-bus](https://www.npmjs.com/package/i2c-bus) nodeJS package to communicate with the chip over I2C.

## Supported variants

| Variant | Board / SKU | Supported | Tested |
|---------|-------------|-------------:|------------------:|
| Regular | PCBA-DBM-r3 | :white_check_mark: | :white_check_mark: |
| Spectrum Analyzer    | PCBA-DBM-r3-SA | :white_check_mark: | :x: |
| Pro     | PCBA-DBM-r3-PRO | :x: | :x: |

## Installation

```bash
npm install pcb-artists-decibel-meter
```

## Usage

```javascript
const { DecibelMeter } = require('pcb-artists-decibel-meter');

(async () => {
    const device = new DecibelMeter();

    while (true) {
        const db = await device.readDecibel();
        const minDb = await device.readMin();
        const maxDb = await device.readMax();

        console.log(`Decibel: ${db} dB, Min: ${minDb} dB, Max: ${maxDb} dB`);

        await new Promise((r) => setTimeout(r, 1000));
    }
})();
```

```javascript
const { DecibelMeter } = require('pcb-artists-decibel-meter');

(async () => {
    const device = new DecibelMeter();
    await device.clearHistory();

    while (true) {
        const history = await device.readHistory();
        console.log('Decibel History:', history);
        await new Promise((r) => setTimeout(r, 1000));
    }
})();
```