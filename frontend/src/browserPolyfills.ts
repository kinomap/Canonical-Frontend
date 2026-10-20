// @ton/core uses the standard Buffer API. Install the browser implementation before its modules evaluate.
import { Buffer } from 'buffer'
if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer
