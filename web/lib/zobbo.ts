import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

export interface Profile {
  owner: string;
  handle: string;
  display_name: string;
  bio: string;
  total_received: number;
  tip_count: number;
  created_at: number;
}

const CONTRACT_ID = process.env.NEXT_PUBLIC_ZOBBO_CONTRACT_ID ?? "";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

export const isConfigured = CONTRACT_ID.startsWith("C");
export const contractId = CONTRACT_ID;
export const server = new SorobanRpc.Server(RPC_URL);

const str = (v: string) => nativeToScVal(v, { type: "string" });
const addr = (v: string) => new Address(v).toScVal();

async function simulateRead(method: string, args: xdr.ScVal[]) {
  const source = new Account(
    "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    "0"
  );
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  const retval = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse)
    .result?.retval;
  return retval ? scValToNative(retval) : null;
}

async function invoke(
  signer: string,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
  const { getKit } = await import("./kit");
  const account = await server.getAccount(signer);

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call(method, ...args))
    .setTimeout(60)
    .build();

  tx = await server.prepareTransaction(tx);

  const signed = await getKit().signTransaction(tx.toXDR(), {
    networkPassphrase: PASSPHRASE,
    address: signer,
  });

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === "ERROR") throw new Error("Transaction rejected");

  for (let i = 0; i < 30; i++) {
    const res = await server.getTransaction(sent.hash);
    if (res.status === "SUCCESS") return sent.hash;
    if (res.status === "FAILED") throw new Error("Transaction failed");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for confirmation");
}

export function register(
  owner: string,
  handle: string,
  displayName: string,
  bio: string
) {
  return invoke(owner, "register", [
    addr(owner),
    str(handle),
    str(displayName),
    str(bio),
  ]);
}

export function updateProfile(owner: string, displayName: string, bio: string) {
  return invoke(owner, "update_profile", [
    addr(owner),
    str(displayName),
    str(bio),
  ]);
}

export function tip(
  from: string,
  handle: string,
  amount: bigint,
  message: string
) {
  return invoke(from, "tip", [
    addr(from),
    str(handle),
    nativeToScVal(amount, { type: "i128" }),
    str(message),
  ]);
}

export async function getProfile(handle: string): Promise<Profile | null> {
  try {
    const p = await simulateRead("get_profile", [str(handle)]);
    if (!p) return null;
    return {
      owner: p.owner,
      handle: p.handle,
      display_name: p.display_name,
      bio: p.bio,
      total_received: Number(p.total_received),
      tip_count: Number(p.tip_count),
      created_at: Number(p.created_at),
    };
  } catch {
    return null;
  }
}

export async function getHandle(owner: string): Promise<string | null> {
  try {
    return (await simulateRead("get_handle", [addr(owner)])) ?? null;
  } catch {
    return null;
  }
}
