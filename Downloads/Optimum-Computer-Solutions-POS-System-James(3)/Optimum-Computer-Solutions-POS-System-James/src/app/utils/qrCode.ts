const VERSION = 5;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 108;
const ERROR_CODEWORDS = 26;
const ALIGNMENT_CENTERS = [6, 30];
const FORMAT_ERROR_CORRECTION_LEVEL_L = 1;
const FORMAT_MASK = 0x5412;

type MatrixCell = boolean | null;

const createEmptyMatrix = () => ({
  modules: Array.from({ length: SIZE }, () => Array<MatrixCell>(SIZE).fill(null)),
  reserved: Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false))
});

const setModule = (
  modules: MatrixCell[][],
  reserved: boolean[][],
  row: number,
  column: number,
  value: boolean,
  isReserved = true
) => {
  if (row < 0 || column < 0 || row >= SIZE || column >= SIZE) return;
  modules[row][column] = value;
  if (isReserved) reserved[row][column] = true;
};

const addBits = (bits: number[], value: number, length: number) => {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
};

const bytesFromText = (text: string) => Array.from(new TextEncoder().encode(text));

const createDataCodewords = (text: string) => {
  const bytes = bytesFromText(text);
  if (bytes.length > 106) {
    throw new Error('Receipt QR payload is too long.');
  }

  const bits: number[] = [];
  addBits(bits, 0b0100, 4);
  addBits(bits, bytes.length, 8);
  bytes.forEach(byte => addBits(bits, byte, 8));

  const maxBits = DATA_CODEWORDS * 8;
  addBits(bits, 0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(Number.parseInt(bits.slice(index, index + 8).join(''), 2));
  }

  for (let padIndex = 0; codewords.length < DATA_CODEWORDS; padIndex += 1) {
    codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return codewords;
};

const createGaloisTables = () => {
  const exp = Array<number>(512).fill(0);
  const log = Array<number>(256).fill(0);
  let value = 1;

  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }

  for (let index = 255; index < 512; index += 1) {
    exp[index] = exp[index - 255];
  }

  return { exp, log };
};

const { exp: GF_EXP, log: GF_LOG } = createGaloisTables();

const gfMultiply = (left: number, right: number) => {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
};

const polynomialMultiply = (left: number[], right: number[]) => {
  const result = Array<number>(left.length + right.length - 1).fill(0);
  left.forEach((leftCoefficient, leftIndex) => {
    right.forEach((rightCoefficient, rightIndex) => {
      result[leftIndex + rightIndex] ^= gfMultiply(leftCoefficient, rightCoefficient);
    });
  });
  return result;
};

const createGeneratorPolynomial = (degree: number) => {
  let polynomial = [1];
  for (let index = 0; index < degree; index += 1) {
    polynomial = polynomialMultiply(polynomial, [1, GF_EXP[index]]);
  }
  return polynomial;
};

const createErrorCorrectionCodewords = (data: number[]) => {
  const generator = createGeneratorPolynomial(ERROR_CODEWORDS);
  const remainder = Array<number>(ERROR_CODEWORDS).fill(0);

  data.forEach(codeword => {
    const factor = codeword ^ remainder.shift()!;
    remainder.push(0);

    generator.slice(1).forEach((coefficient, index) => {
      remainder[index] ^= gfMultiply(coefficient, factor);
    });
  });

  return remainder;
};

const drawFinderPattern = (modules: MatrixCell[][], reserved: boolean[][], row: number, column: number) => {
  for (let offsetRow = -1; offsetRow <= 7; offsetRow += 1) {
    for (let offsetColumn = -1; offsetColumn <= 7; offsetColumn += 1) {
      const currentRow = row + offsetRow;
      const currentColumn = column + offsetColumn;
      const inFinder = offsetRow >= 0 && offsetRow <= 6 && offsetColumn >= 0 && offsetColumn <= 6;
      const isDark = inFinder && (
        offsetRow === 0 ||
        offsetRow === 6 ||
        offsetColumn === 0 ||
        offsetColumn === 6 ||
        (offsetRow >= 2 && offsetRow <= 4 && offsetColumn >= 2 && offsetColumn <= 4)
      );
      setModule(modules, reserved, currentRow, currentColumn, isDark);
    }
  }
};

const drawAlignmentPattern = (modules: MatrixCell[][], reserved: boolean[][], row: number, column: number) => {
  for (let offsetRow = -2; offsetRow <= 2; offsetRow += 1) {
    for (let offsetColumn = -2; offsetColumn <= 2; offsetColumn += 1) {
      const distance = Math.max(Math.abs(offsetRow), Math.abs(offsetColumn));
      setModule(modules, reserved, row + offsetRow, column + offsetColumn, distance !== 1);
    }
  }
};

const drawFunctionPatterns = (modules: MatrixCell[][], reserved: boolean[][]) => {
  drawFinderPattern(modules, reserved, 0, 0);
  drawFinderPattern(modules, reserved, 0, SIZE - 7);
  drawFinderPattern(modules, reserved, SIZE - 7, 0);

  for (let index = 8; index < SIZE - 8; index += 1) {
    setModule(modules, reserved, 6, index, index % 2 === 0);
    setModule(modules, reserved, index, 6, index % 2 === 0);
  }

  ALIGNMENT_CENTERS.forEach(row => {
    ALIGNMENT_CENTERS.forEach(column => {
      const overlapsFinder = (row === 6 && column === 6) || (row === 6 && column === SIZE - 7) || (row === SIZE - 7 && column === 6);
      if (!overlapsFinder) drawAlignmentPattern(modules, reserved, row, column);
    });
  });

  setModule(modules, reserved, SIZE - 8, 8, true);

  for (let index = 0; index < 9; index += 1) {
    if (index !== 6) {
      setModule(modules, reserved, 8, index, false);
      setModule(modules, reserved, index, 8, false);
    }
  }

  for (let index = 0; index < 8; index += 1) {
    setModule(modules, reserved, 8, SIZE - 1 - index, false);
    setModule(modules, reserved, SIZE - 1 - index, 8, false);
  }
};

const shouldMask = (mask: number, row: number, column: number) => {
  switch (mask) {
    case 0: return (row + column) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return column % 3 === 0;
    case 3: return (row + column) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5: return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6: return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    case 7: return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
    default: return false;
  }
};

const placeDataBits = (modules: MatrixCell[][], reserved: boolean[][], bits: number[], mask: number) => {
  let bitIndex = 0;
  let direction = -1;

  for (let column = SIZE - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;

    for (let rowStep = 0; rowStep < SIZE; rowStep += 1) {
      const row = direction === -1 ? SIZE - 1 - rowStep : rowStep;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const currentColumn = column - columnOffset;
        if (reserved[row][currentColumn]) continue;

        const rawBit = bits[bitIndex] === 1;
        modules[row][currentColumn] = shouldMask(mask, row, currentColumn) ? !rawBit : rawBit;
        bitIndex += 1;
      }
    }

    direction *= -1;
  }
};

const createFormatBits = (mask: number) => {
  let data = (FORMAT_ERROR_CORRECTION_LEVEL_L << 3) | mask;
  let value = data << 10;
  const generator = 0x537;

  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((value >> bit) & 1) === 1) {
      value ^= generator << (bit - 10);
    }
  }

  return ((data << 10) | value) ^ FORMAT_MASK;
};

const drawFormatBits = (modules: MatrixCell[][], reserved: boolean[][], mask: number) => {
  const bits = createFormatBits(mask);

  for (let index = 0; index <= 5; index += 1) setModule(modules, reserved, 8, index, ((bits >> index) & 1) === 1);
  setModule(modules, reserved, 8, 7, ((bits >> 6) & 1) === 1);
  setModule(modules, reserved, 8, 8, ((bits >> 7) & 1) === 1);
  setModule(modules, reserved, 7, 8, ((bits >> 8) & 1) === 1);
  for (let index = 9; index < 15; index += 1) setModule(modules, reserved, 14 - index, 8, ((bits >> index) & 1) === 1);

  for (let index = 0; index < 8; index += 1) setModule(modules, reserved, SIZE - 1 - index, 8, ((bits >> index) & 1) === 1);
  for (let index = 8; index < 15; index += 1) setModule(modules, reserved, 8, SIZE - 15 + index, ((bits >> index) & 1) === 1);
};

const getPenaltyScore = (matrix: boolean[][]) => {
  let penalty = 0;

  for (let row = 0; row < SIZE; row += 1) {
    let runColor = matrix[row][0];
    let runLength = 1;
    for (let column = 1; column < SIZE; column += 1) {
      if (matrix[row][column] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) penalty += 3 + runLength - 5;
        runColor = matrix[row][column];
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += 3 + runLength - 5;
  }

  for (let column = 0; column < SIZE; column += 1) {
    let runColor = matrix[0][column];
    let runLength = 1;
    for (let row = 1; row < SIZE; row += 1) {
      if (matrix[row][column] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) penalty += 3 + runLength - 5;
        runColor = matrix[row][column];
        runLength = 1;
      }
    }
    if (runLength >= 5) penalty += 3 + runLength - 5;
  }

  for (let row = 0; row < SIZE - 1; row += 1) {
    for (let column = 0; column < SIZE - 1; column += 1) {
      const color = matrix[row][column];
      if (matrix[row][column + 1] === color && matrix[row + 1][column] === color && matrix[row + 1][column + 1] === color) {
        penalty += 3;
      }
    }
  }

  const finderLikePattern = '10111010000';
  const reverseFinderLikePattern = '00001011101';
  for (let row = 0; row < SIZE; row += 1) {
    const line = matrix[row].map(cell => (cell ? '1' : '0')).join('');
    for (let column = 0; column <= SIZE - 11; column += 1) {
      const segment = line.slice(column, column + 11);
      if (segment === finderLikePattern || segment === reverseFinderLikePattern) penalty += 40;
    }
  }
  for (let column = 0; column < SIZE; column += 1) {
    const line = matrix.map(row => (row[column] ? '1' : '0')).join('');
    for (let row = 0; row <= SIZE - 11; row += 1) {
      const segment = line.slice(row, row + 11);
      if (segment === finderLikePattern || segment === reverseFinderLikePattern) penalty += 40;
    }
  }

  const darkModules = matrix.flat().filter(Boolean).length;
  const darkPercent = (darkModules * 100) / (SIZE * SIZE);
  penalty += Math.floor(Math.abs(darkPercent - 50) / 5) * 10;

  return penalty;
};

export const createQrMatrix = (text: string) => {
  const data = createDataCodewords(text);
  const codewords = [...data, ...createErrorCorrectionCodewords(data)];
  const dataBits = codewords.flatMap(codeword =>
    Array.from({ length: 8 }, (_, index) => (codeword >> (7 - index)) & 1)
  );

  let bestMatrix: boolean[][] | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const { modules, reserved } = createEmptyMatrix();
    drawFunctionPatterns(modules, reserved);
    placeDataBits(modules, reserved, dataBits, mask);
    drawFormatBits(modules, reserved, mask);
    const matrix = modules.map(row => row.map(Boolean));
    const penalty = getPenaltyScore(matrix);

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMatrix = matrix;
    }
  }

  return bestMatrix!;
};

export const createReceiptQrPayload = (transactionId: string, total: number, timestamp: Date) =>
  `SALE:${transactionId};TOTAL:${total.toFixed(2)};TS:${timestamp.toISOString()}`;
