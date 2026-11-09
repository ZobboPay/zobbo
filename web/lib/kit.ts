"use client";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { Networks } from "@creit.tech/stellar-wallets-kit/types";

export const PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

let ready = false;

/** Initialise the kit once (browser only). It persists the selected wallet in localStorage. */
export function getKit() {
  if (!ready) {
    StellarWalletsKit.init({
      modules: defaultModules(),
      network: PASSPHRASE as Networks,
    });
    ready = true;
  }
  return StellarWalletsKit;
}
