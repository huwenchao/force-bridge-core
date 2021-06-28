import { KeyStore } from '@force-bridge/keystore';

const password = '123456';
// prettier-ignore
export const dummyKeyStore = KeyStore.createFromPairs(
  {
    'ckb':            '0xa800c82df5461756ae99b5c6677d019c98cc98c7786b80d7b2e77256e46ea1fe',
    'ckb-multisig-1': '0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc',
    'ckb-multisig-2': '0x63d86723e08f0f813a36ce6aa123bb2289d90680ae1e99d4de8cdb334553f24d',
    'eth':            '0xc4ad657963930fbff2e9de3404b30a4e21432c89952ed430b56bf802945ed37a',
    'eth-multisig-1': '0x859bd720921bb5e60e3133ca11d534edebae38e7c1cd97214f310b4ce400155b',
    'eth-multisig-2': '0x193c96316c6cada898f067004aa07a5d48fcecdb1aa158784f2e8868a4db7ce8',
    'eth-multisig-3': '0x57c246bcb73e5d3409a903c94d46b3b118fdcfb81c5e51d3b0df72e883623fa7',
  },
  password,
);

dummyKeyStore.decrypt(password);
