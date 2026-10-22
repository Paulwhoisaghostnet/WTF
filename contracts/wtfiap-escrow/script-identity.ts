/** Protocol comb-pair data normalization, confined to explicitly typed PUSH literals. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalMichelsonScriptCode } from '../../scripts/pasta-protocol/pasta-michelson-script-identity';
function data(type: any, value: any): any {
  if (type?.prim === 'pair') {
    const fields = Array.isArray(value) ? value : value?.prim === 'Pair' ? value.args : null;
    assert(Array.isArray(fields) && fields.length >= 2 && type.args?.length >= 2, 'Invalid typed pair literal.');
    const rightType = type.args.length === 2 ? type.args[1] : { prim: 'pair', args: type.args.slice(1) };
    const right = fields.length === 2 ? fields[1] : fields.slice(1);
    return { prim: 'Pair', args: [data(type.args[0], fields[0]), data(rightType, right)] };
  }
  if (type?.prim === 'option' && value?.prim === 'Some') return { ...value, args: [data(type.args[0], value.args[0])] };
  if (type?.prim === 'or' && ['Left', 'Right'].includes(value?.prim)) return { ...value, args: [data(type.args[value.prim === 'Left' ? 0 : 1], value.args[0])] };
  if (['list','set'].includes(type?.prim) && Array.isArray(value)) return value.map(v => data(type.args[0], v));
  if (['map','big_map'].includes(type?.prim) && Array.isArray(value)) return value.map(v => {
    assert.equal(v.prim, 'Elt'); return { ...v, args: [data(type.args[0],v.args[0]),data(type.args[1],v.args[1])] };
  });
  return value;
}
function visit(value: any): any {
  if (Array.isArray(value)) return value.map(visit);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key,item]) => [key,visit(item)]));
  if (result.prim === 'PUSH' && Array.isArray(result.args) && result.args.length === 2) {
    result.args = [result.args[0], data(result.args[0], result.args[1])];
  }
  return result;
}
export const canonicalTypedScript = (code: unknown) => canonicalMichelsonScriptCode(visit(code));
export const hashTypedScript = (code: unknown) => createHash('sha256').update(JSON.stringify(canonicalTypedScript(code))).digest('hex');
export function assertTypedScriptIdentity(actual: unknown, expected: unknown, message: string): string {
  assert.deepEqual(canonicalTypedScript(actual),canonicalTypedScript(expected),message);
  return hashTypedScript(actual);
}
