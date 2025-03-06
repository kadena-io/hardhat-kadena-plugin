import picocolors from 'picocolors';
import { Readable } from 'stream';
import { styleText } from 'util';

export type Color = 'cyan' | 'yellow' | 'magenta' | 'blue' | 'green' | 'red';
export type LogOptions = Parameters<typeof styleText>[0];
type LogFunction = (msg: string) => void;
export type Logger = {
  info: LogFunction;
  error: LogFunction;
};

export const COLOR_PALETTE: Color[] = [
  'cyan',
  'yellow',
  'magenta',
  'blue',
  'green',
  'red',
];

const colorText =
  styleText ||
  function styleText(color: Color, text: string) {
    if (!picocolors[color]) {
      return text;
    }
    return picocolors[color](text);
  };

/* *************************************************************************** */
/* Logging */

// TODO: should we use a logging library like winston or pino or would that make
// this code to opinionated?

export function logInfo(
  color: LogOptions,
  label: string | number,
  msg: string,
) {
  const prefixedLabel = `[hardhat ${label}]`;
  const styledLable = colorText(color, prefixedLabel);

  console.log(styledLable, msg);
}

export function logError(
  color: LogOptions,
  label: string | number,
  msg: string,
) {
  const prefixedLabel = `[hardhat ${label}]`;
  const styledLable = colorText(color, prefixedLabel);

  console.error(styledLable, msg);
}

export function streamLogger(stream: Readable, logFun: (msg: string) => void) {
  let buffer = '';
  stream.on('data', (data) => {
    const parts = (buffer + data).split(/\r?\n/);
    for (const line of parts.slice(0, -1)) {
      logFun(line);
    }
    buffer = parts.slice(-1).join();
  });
  return buffer;
}
