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
const { DecibelMeter } = require()
```