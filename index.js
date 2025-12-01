const i2c = require('i2c-bus');

const DEFAULT_ADDRESS = 0x48;

const VERSION = 0x00;
const CONTROL = 0x06;
const TAVG_HIGH = 0x07;
const TAVG_LOW = 0x08;
const RESET = 0x09;
const DECIBEL = 0x0A;
const MIN = 0x0B;
const MAX = 0x0C;
const DBHISTORY_0 = 0x14;
const FREQ_64BINS_0 = 0x78;
const FREQ_16BINS_0 = 0xB8;

const Filter = {
    // No filter
    NONE: 0,
    // A-weighting (default)
    A_WEIGHTING: 1,
    // C-weighting
    C_WEIGHTING: 2
}

class DecibelMeter {
    /**
     * Create a new DecibelMeter instance.
     *
     * @param {Object} options - Configuration options.
     * @param {number} [options.i2cBusNumber=1] - The I2C bus number to use.
     * @param {number} [options.address=DEFAULT_ADDRESS] - The I2C address of the device.
     */
    constructor({i2cBusNumber = 1, address = DEFAULT_ADDRESS} = {}) {
        this.i2cBus = i2c.openPromisified(i2cBusNumber);
        this.address = address;

        this.filter = Filter.A_WEIGHTING; // default
        this.averagingTime = 1000; // default

        // Get device version
        this.i2cBus.then(async (bus) => {
            const version = await bus.readByte(this.address, VERSION);
            this.isRegular = version === 0x31;
        }).catch((err) => {
            throw new Error(`Failed to communicate with Decibel Meter at address 0x${this.address.toString(16)}: ${err.message}`);
        });
    }

    /**
     * Set the sound level filter type.
     *
     * @param {Filter} filter - The filter type to set (NONE, A_WEIGHTING, C_WEIGHTING).
     * @returns {Promise<void>} Resolves after the register write.
     * @throws {Error} If filter type is invalid.
     * @throws {Error} If underlying I/O operations fail.
     * 
     * @example
     * await device.setFilter(Filter.C_WEIGHTING);
     */
    async setFilter(filter) {
        if (!Object.values(Filter).includes(filter)) {
            throw new Error('Invalid filter type');
        }

        let controlReg = await this._readByte(CONTROL);
        controlReg = (controlReg & 0xF9) | filter << 1;
        await this._writeByte(CONTROL, controlReg);

        this.filter = filter;
    }

    /**
     * Power down the device.
     *
     * @returns {Promise<void>} Resolves after the register write.
     * @throws {Error} If underlying I/O operations fail.
     */
    async powerDown() {
        let controlReg = await this._readByte(CONTROL);
        await this._writeByte(CONTROL, controlReg | 0x01);
    }

    /**
     * Power up the device. All settings are restored to defaults.
     * 
     * This is only needed if the device was previously powered down with powerDown().
     *
     * @returns {Promise<void>} Resolves after the device is powered up.
     * @throws {Error} If underlying I/O operations fail.
     */
    async powerUp() {
        await this.resetDevice();
    }

    /**
     * Set the averaging time in milliseconds.
     * 
     * Used for calculating the decibel level.
     *
     * @param {number} ms - The averaging time in milliseconds (0-65535).
     * @returns {Promise<void>} Resolves after the register write.
     * @throws {Error} If averaging time is out of range.
     * @throws {Error} If underlying I/O operations fail.
     * 
     * @example
     * await device.setAveragingTime(500);
     */
    async setAveragingTime(ms) {
        if (ms < 0 || ms > 65535) {
            throw new Error('Averaging time must be between 0 and 65535 ms');
        }

        // TAVG_HIGH must be written first!
        await this._writeByte(TAVG_HIGH, (ms >> 8) & 0xFF);
        await this._writeByte(TAVG_LOW, ms & 0xFF);
    }

    /**
     * Clear the decibel history buffer.
     *
     * @returns {Promise<void>} Resolves after the register write.
     * @throws {Error} If underlying I/O operations fail.
     */
    async clearHistory() {
        await this._writeByte(RESET, 0x04);
    }

    /**
     * Clear the min and max decibel values.
     *
     * @returns {Promise<void>} Resolves after the register write.
     * @throws {Error} If underlying I/O operations fail.
     */
    async clearMinMax() {
        await this._writeByte(RESET, 0x02);
    }

    /**
     * Reset the device to default settings.
     *
     * @returns {Promise<void>} Resolves after the register write.
     * @throws {Error} If underlying I/O operations fail.
     */
    async resetDevice() {
        await this._writeByte(RESET, 0x08);
    }

    /**
     * Read the current decibel level.
     *
     * @returns {Promise<number>} The current decibel level.
     * @throws {Error} If underlying I/O operations fail.
     * 
     * @example
     * const db = await device.readDecibel();
     */
    async readDecibel() {
        return await this._readByte(DECIBEL);
    }

    /**
     * Read the minimum decibel level recorded.
     * 
     * This is the minimum since the device was powered on or since the last clearMinMax() call.
     *
     * @returns {Promise<number>} The minimum decibel level.
     * @throws {Error} If underlying I/O operations fail.
     * 
     * @example
     * const minDb = await device.readMin();
     */
    async readMin() {
        return await this._readByte(MIN);
    }
    
    /**
     * Read the maximum decibel level recorded.
     * 
     * This is the maximum since the device was powered on or since the last clearMinMax() call.
     *
     * @returns {Promise<number>} The maximum decibel level.
     * @throws {Error} If underlying I/O operations fail.
     * 
     * @example
     * const maxDb = await device.readMax();
     */
    async readMax() {
        return await this._readByte(MAX);
    }

    /**
     * Read the decibel history buffer. Maximum of 100 entries depending on how long the device has been running
     * and when the last clearHistory() call was made.
     * 
     * The most recent value is at index 0. 
     * 
     * @returns {Promise<number[]>} An array of decibel values from history.
     * @throws {Error} If underlying I/O operations fail.
     * @example
     * const history = await device.readHistory();
     * console.log('Oldest decibel reading:', history[history.length - 1]);
     */
    async readHistory() {
        const result = [];

        for (let i = 0; i < 4 && i * 32 < 100; i++) {
            const bytesToRead = Math.min(32, 100 - result.length); // i2c bus lib has a max of 32 bytes per read
            const historyBuf = await this._readBlock(DBHISTORY_0 + i * 32, bytesToRead);

            for (let j = 0; j < historyBuf.length; j++) {
                if (historyBuf[j] === 0) return result; // end of valid data
                result.push(historyBuf[j]);
            }
        }

        return result;
    }

    /**
     * Only available in Spectrum Analyzer version.
     * 
     * Frequency components of the signal represented as 64 bands (8 kHz total band width). 
     * The number represents the magnitude of the frequency component in dB SPL.
     * 
     * No weighting filters are applied to frequency data.
     * 
     * @returns {Promise<number[]>} An array of 64 frequency bin values.
     * @throws {Error} If underlying I/O operations fail.
     * @throws {Error} If called on regular version of the Decibel Meter.
     */
    async readFrequencyBins64() {
        if (this.isRegular) {
            throw new Error('Frequency bins are only available in Spectrum Analyzer version of the Decibel Meter');
        }

        const bins = [];
        const bufLower = await this._readBlock(FREQ_64BINS_0, 32);
        const bufUpper = await this._readBlock(FREQ_64BINS_0 + 32, 32);
        
        bufLower.forEach(b => bins.push(b));
        bufUpper.forEach(b => bins.push(b));

        return bins;
    }

    /**
     * Only available in Spectrum Analyzer version.
     * 
     * Frequency components of the signal represented as 16 bands (8 kHz total band width). 
     * The number represents the magnitude of the frequency component in dB SPL.
     * 
     * No weighting filters are applied to frequency data.
     * 
     * @returns {Promise<number[]>} An array of 16 frequency bin values.
     * @throws {Error} If underlying I/O operations fail.
     * @throws {Error} If called on regular version of the Decibel Meter.
     */
    async readFrequencyBins16() {
        if (this.isRegular) {
            throw new Error('Frequency bins are only available in Spectrum Analyzer version of the Decibel Meter');
        }

        const bins = [];
        const buf = await this._readBlock(FREQ_16BINS_0, 16);
        
        buf.forEach(b => bins.push(b));

        return bins;
    }

    /**
     * Read a single byte from a register.
     *
     * @private
     * @async
     * @param {number} reg - The register address to read from.
     * @returns {Promise<number>} The byte value read.
     */
    async _readByte(reg) {
        const bus = await this.i2cBus;
        return bus.readByte(this.address, reg);
    }

    /**
     * Write a single byte to a register.
     *
     * @private
     * @async
     * @param {number} reg - The register address to write to.
     * @param {number} value - The value to write (0-255).
     * @returns {Promise<void>} Resolves when the write is complete.
     */
    async _writeByte(reg, value) {
        const bus = await this.i2cBus;
        return bus.writeByte(this.address, reg, value);
    }

    /**
     * Read a block of bytes from a register.
     *
     * @private
     * @async
     * @param {number} reg - The starting register address.
     * @param {number} length - The number of bytes to read.
     * @returns {Promise<Buffer>} A buffer containing the read bytes.
     */
    async _readBlock(reg, length) {
        const buffer = Buffer.alloc(length);
        const bus = await this.i2cBus;
        await bus.readI2cBlock(this.address, reg, length, buffer);
        return buffer;
    }
}

module.exports = {DecibelMeter, Filter};