const Helpers = require('./helpers');
const Events = require('./events');
const sha256 = require('./sha256');
const fs = require('fs');
const os = require('os');

let defaultConfig = {
    writeFile: {
        prefix: '',
        humanize: true,
        folderPath: './logs'
    }
};

/**
 * katch
 * @see https://blog.sentry.io/2016/01/04/client-javascript-reporting-window-onerror.html
 * @param opts {object} options object
 */
function katch(opts) {

    if (typeof opts === 'object') {
        katch.config = Helpers.defaults(opts, defaultConfig);
    }

    if (Helpers.isBrowser()) {
        window.onerror = function (msg, url, lineNo, columnNo, error) {
            katch.captureError(error, {
                message: msg,
                url: url,
                lineNo: lineNo,
                columnNo: columnNo
            });
        }
    } else {
        process.on('uncaughtException', (error) => {
            katch.captureError(error);
        });
    }

    return katch;
}

/**
 * Config params
 * @type {{}}
 */
katch.config = defaultConfig;

/**
 * Catch error
 * @param error {Error} error object
 * @param params {Object} optional params object
 */
katch.captureError = (error, params = {}) => {
    Events.fire('error', error, params);
    Events.fire(`type${error.name}`, error, params);
    Events.fire('beforeLog', error, params);

    let logObj = {
        time: Helpers.getLocaleISODate(),
        hash: sha256(error.stack),
        error: error.stack,
        params: params
    };

    if (Helpers.isBrowser()) {

        logObj.agent = navigator.userAgent;

        let logName = 'katch';
        let logDayKey = Helpers.getLocaleISODate('date');
        let logAtDay = JSON.parse(localStorage.getItem(logName)) || [];

        if(!logAtDay[logDayKey])
            logAtDay[logDayKey] = [];

        logAtDay[logDayKey].push(logObj);
        localStorage.setItem(logName, JSON.stringify(logAtDay));

    } else if (Helpers.isServer()) {

        let filename = Helpers.getLocaleISODate('date') + '.log';
        let folderPath = katch.config.writeFile.folderPath;
        let fileContent = '';
        let prefix = katch.config.writeFile.prefix;

        logObj.pid = process.pid;
        logObj.platform = process.platform;

        if(katch.config.humanize) {
            let separator = '------------------------------------------------------------------------------------';
            fileContent = `${logObj.time} ${logObj.hash}\n${logObj.error}\n${separator}\n`;
        } else {
            fileContent = JSON.stringify(logObj)
        }
        /*
        If writeFile is falsy do not write
         */
        if(katch.config.writeFile) {
            if (!fs.existsSync(folderPath))
                fs.mkdirSync(folderPath);
            fs.appendFileSync(`${folderPath}/${prefix}${filename}`, fileContent);
        }
    }

    Events.fire('afterLog', error, params);
};

/**
 * Wrapper function
 * @type {function(*, *=)}
 */
katch.wrap = ((func, params = {}) => {
   try {
       func();
   } catch (e) {
       katch.captureError(e, params);
   }
});

/**
 * Call events
 * @param event {string} event name
 * @param callback {function} callback function
 */
katch.on = Events.on;

module.exports = katch;