// Estimated list-price cost of a Claude API call, used for the monthly AI budget.
// USD per million tokens [input, output]. Thinking tokens are billed as output.
// Unknown models are priced at the most expensive tier so the cap errs on the safe side.
const PRICES = {
  'claude-fable-5-1':  [10, 50],
  'claude-fable-5':    [10, 50],
  'claude-opus-5-5':   [4, 20],
  'claude-opus-5':     [5, 25],
  'claude-opus-4-8':   [5, 25],
  'claude-opus-4-7':   [5, 25],
  'claude-opus-4-6':   [5, 25],
  'claude-sonnet-5':   [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5':  [1, 5],
};
const FALLBACK = [10, 50];

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/** Cost in micro-USD (integer) for an API `usage` object. */
export function costMicroUsd(model, usage = {}) {
  const [inPrice, outPrice] = PRICES[model] ?? FALLBACK;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  // price per million tokens == micro-USD per token
  const micro = input * inPrice
    + cacheWrite * inPrice * CACHE_WRITE_MULTIPLIER
    + cacheRead * inPrice * CACHE_READ_MULTIPLIER
    + output * outPrice;
  return Math.ceil(micro);
}

export const microToUsd = (micro) => Math.round(micro / 10_000) / 100;
