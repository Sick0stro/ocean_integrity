import axios from 'axios';
import { ethers } from 'ethers';

export type RecyclingDocRow = {
  invoice_number: string;
  invoice_url: string;
  eft_url: string;
  ewaybill_url: string;
  recycler_company: string;
  plastic_type: string; // e.g., PET1
  tonnage_kg: number; // normalized to kg
  origin: string; // country or empty
  country?: string;
  city?: string;
  currency: string; // ISO currency, informational only
  upload_date?: string | null;
  uploaded_by?: string | null;
};

export type PlastiksConfig = {
  baseUrl: string;
  apiToken: string;
  userAddress: string; // checksummed
  privateKey: string; // hex string, may or may not start with 0x
};

export type PlastiksCollection = {
  id: number;
  address: string;
  weight: number;
  name: string;
  metadata_hash?: string;
  image_hash?: string;
  no_of_copies?: number;
  donation?: string | number;
};

export function getPlastiksConfig(): PlastiksConfig {
  const baseUrl =
    process.env.PLASTIKS_BASE_URL || 'https://staging.plastiks.io';
  const apiToken = process.env.API_TOKEN_CALL || '';
  const userAddress = process.env.USER_ADDRESS || '';
  const privateKey = process.env.PRIVATE_KEY || '';

  if (!apiToken || !userAddress || !privateKey) {
    throw new Error(
      'Missing Plastiks credentials: API_TOKEN_CALL, USER_ADDRESS, PRIVATE_KEY'
    );
  }

  const checksummed = ethers.getAddress(userAddress);

  return {
    baseUrl,
    apiToken,
    userAddress: checksummed,
    privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
  };
}

export function createPlastiksClient(config: PlastiksConfig) {
  return axios.create({
    baseURL: config.baseUrl,
    headers: {
      'API-key': config.apiToken,
      'User-Address': config.userAddress,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });
}

function axiosErrorToString(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    return `HTTP ${status} - ${typeof data === 'string' ? data : JSON.stringify(data)}`;
  }
  return String(err);
}

export async function getBlockchainConfig(
  client: ReturnType<typeof createPlastiksClient>
) {
  const resp = await client.get('/api/collections/plastic_types');
  if (!resp.data) throw new Error('plastiks: empty response');
  const cfg = resp.data;
  const celo = cfg.contract_addresses?.celo;
  if (!celo?.plastik_crypto || !celo?.recycling_nft || !celo?.plastik_token) {
    throw new Error('plastiks: missing contract addresses');
  }
  return {
    celoChainId: cfg.celo_chain_id,
    usingTestnet: cfg.using_testnet,
    plastikCrypto: celo.plastik_crypto,
    recyclingNft: celo.recycling_nft,
    erc20Token: celo.plastik_token,
    plastikTokenDecimals: celo.plastik_token_decimals,
    storefront: celo.storefront,
    plastikRole: celo.plastik_role,
  } as const;
}

export async function createPrgCollection(
  client: ReturnType<typeof createPlastiksClient>,
  params: {
    name: string;
    description: string;
    plastik_type: string; // e.g., PET1
    weightKg: number;
    city?: string;
    country?: string;
  }
) {
  const pricePerKg = 1.0; // 1 token per kg (staging default)
  // Plastiks expects price as string; use minimal non-zero to avoid pricing errors
  const totalPrice = Math.max(1, Math.round(params.weightKg * pricePerKg));
  const noOfCopies = Math.max(1, Math.round(params.weightKg));

  const body = {
    name: params.name,
    description: params.description,
    plastik_type: params.plastik_type,
    instant_sale_price: totalPrice.toString(),
    no_of_copies: noOfCopies,
    weight: params.weightKg,
    guarantee_connected: params.weightKg,
    city: params.city || '',
    country: params.country || '',
    // Disable auto-image generation to avoid staging dependency failures
    use_autogen_image: 'false',
  };

  try {
    const resp = await client.post('/api/collections/prg', body);
    if (!resp.data?.success) throw new Error('plastiks: PRG creation failed');
    return resp.data.collection as PlastiksCollection;
  } catch (e) {
    throw new Error(`plastiks: PRG creation error: ${axiosErrorToString(e)}`);
  }
}

export async function signMetadataHash(
  client: ReturnType<typeof createPlastiksClient>,
  cfg: any,
  wallet: ethers.Wallet,
  collectionAddress: string
) {
  try {
    const resp = await client.get(
      `/api/collections/${collectionAddress}/sign_metadata_hash`,
      {
        params: { contract_address: cfg.plastikCrypto },
      }
    );
    const hashToSign: string | undefined = resp.data?.hash_to_sign;
    if (!hashToSign) throw new Error('plastiks: hash_to_sign missing');
    const signature = await wallet.signMessage(ethers.getBytes(hashToSign));
    const saveResp = await client.post(
      `/api/collections/${collectionAddress}/save_metadata_signature`,
      { signature }
    );
    if (!saveResp.data?.success)
      throw new Error('plastiks: save_metadata_signature failed');
  } catch (e) {
    throw new Error(`plastiks: sign_metadata_hash error: ${axiosErrorToString(e)}`);
  }
}

export async function signFixedPrice(
  client: ReturnType<typeof createPlastiksClient>,
  cfg: Record<string, any>,
  wallet: ethers.Wallet,
  prg: PlastiksCollection
) {
  const domain = {
    name: 'PLASTIK',
    version: '2.0',
    verifyingContract: cfg.plastikCrypto,
    chainId: cfg.celoChainId,
  } as const;

  const types = {
    SellRequest: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'erc20Address', type: 'address' },
      { name: 'ngoFeePct', type: 'uint96' },
      { name: 'sellerAddress', type: 'address' },
    ],
  } as const;

  const priceWei = 1_000_000_000; // minimal fixed price in test, matches example
  const value = {
    tokenAddress: cfg.recyclingNft,
    tokenId: Number(prg.id),
    price: priceWei,
    amount: Number(prg.weight),
    erc20Address: cfg.erc20Token,
    ngoFeePct: Number(prg.donation || 0) * 100,
    sellerAddress: wallet.address,
  } as const;

  try {
    const signature = await wallet.signTypedData(
      domain as unknown as ethers.TypedDataDomain,
      types as unknown as Record<string, Array<{ name: string; type: string }>>,
      value as Record<string, unknown>
    );
    const resp = await client.post(
      `/api/collections/${prg.address}/sign_fixed_price`,
      {
        sign: signature,
        price: String(priceWei),
      }
    );
    if (!resp.data?.success) throw new Error('plastiks: sign_fixed_price failed');
  } catch (e) {
    throw new Error(`plastiks: sign_fixed_price error: ${axiosErrorToString(e)}`);
  }
}

export async function signVoucher(
  client: ReturnType<typeof createPlastiksClient>,
  cfg: Record<string, any>,
  wallet: ethers.Wallet,
  prg: PlastiksCollection
) {
  const domain = {
    name: 'PLASTIK',
    version: '2.0',
    chainId: cfg.celoChainId,
    verifyingContract: cfg.plastikCrypto,
  } as const;

  const types = {
    PRGVoucher: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'tokenURI', type: 'string' },
      { name: 'creatorAddress', type: 'address' },
    ],
  } as const;

  const value = {
    tokenAddress: cfg.recyclingNft,
    tokenId: Number(prg.id),
    amount: Number(prg.no_of_copies || Math.max(1, Math.round(prg.weight))),
    tokenURI: String(prg.metadata_hash || ''),
    creatorAddress: wallet.address,
  } as const;

  try {
    const signature = await wallet.signTypedData(
      domain as unknown as ethers.TypedDataDomain,
      types as unknown as Record<string, Array<{ name: string; type: string }>>,
      value as Record<string, unknown>
    );
    const resp = await client.post(
      `/api/collections/${prg.address}/sign_voucher`,
      {
        sign: signature,
        amount: value.amount,
        tokenId: value.tokenId,
        tokenURI: value.tokenURI,
        tokenAddress: value.tokenAddress,
        creatorAddress: value.creatorAddress,
      }
    );
    if (!resp.data?.success) throw new Error('plastiks: sign_voucher failed');
  } catch (e) {
    throw new Error(`plastiks: sign_voucher error: ${axiosErrorToString(e)}`);
  }
}

export async function submitToPlastiks(row: RecyclingDocRow) {
  const cfg = getPlastiksConfig();
  const client = createPlastiksClient(cfg);
  const chain = await getBlockchainConfig(client);
  const wallet = new ethers.Wallet(cfg.privateKey);

  // Build name/description from business data
  const name = `${row.recycler_company} – ${row.invoice_number}`;
  const description = `Recycling proof ${row.plastic_type} ${row.tonnage_kg}kg, ${row.city || ''} ${row.country || row.origin || ''}`.trim();

  // Map to Plastiks expected labels when possible
  const typeMap: Record<string, string> = { PET: 'PET 1', PP: 'PP 5', PVC: 'PVC 3', LDPE: 'LDPE 4' };
  const normalizedType = row.plastic_type?.toUpperCase?.() || '';
  const plastiksType = typeMap[normalizedType] || row.plastic_type;

  const prg = await createPrgCollection(client, {
    name,
    description,
    plastik_type: plastiksType,
    weightKg: row.tonnage_kg,
    city: row.city || '',
    country: row.country || row.origin || '',
  });

  await signMetadataHash(client, chain, wallet, prg.address);
  await signFixedPrice(client, chain, wallet, prg);
  await signVoucher(client, chain, wallet, prg);

  return prg;
}
