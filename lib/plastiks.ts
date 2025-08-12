import axios from 'axios';
import { ethers } from 'ethers';

interface BlockchainConfig {
  celoChainId: number;
  usingTestnet: boolean;
  plastikCrypto: string;
  recyclingNft: string;
  erc20Token: string;
  plastikTokenDecimals: number;
  storefront: string;
  plastikRole: string;
}

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
    return `HTTP ${status} - ${
      typeof data === 'string' ? data : JSON.stringify(data)
    }`;
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
    // NEW: Attachment URLs
    invoice_url?: string;
    eft_url?: string;
    ewaybill_url?: string;
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
    // 🔥 NEW: Include attachment URLs in Plastiks request
    invoice_url: params.invoice_url || '',
    eft_url: params.eft_url || '',
    ewaybill_url: params.ewaybill_url || '',
  };

  // 🔍 ADVANCED LOGGING: Log what's being sent to Plastiks
  console.log('🚀 [PLASTIKS_REQUEST] Creating PRG Collection WITH ATTACHMENTS');
  console.log(
    '📦 [PLASTIKS_REQUEST] Request URL:',
    client.defaults.baseURL + '/api/collections/prg'
  );
  console.log('📝 [PLASTIKS_REQUEST] Request Headers:', {
    'API-key': client.defaults.headers['API-key'] ? '[HIDDEN]' : 'NOT_SET',
    'User-Address': client.defaults.headers['User-Address'],
    'Content-Type': client.defaults.headers['Content-Type'],
  });
  console.log(
    '📋 [PLASTIKS_REQUEST] Request Body:',
    JSON.stringify(body, null, 2)
  );

  // 🔥 NEW: Log attachment inclusion
  console.log('📎 [PLASTIKS_REQUEST] ATTACHMENTS NOW INCLUDED:');
  console.log('   📄 Invoice URL:', params.invoice_url || 'NOT_PROVIDED');
  console.log('   💳 EFT URL:', params.eft_url || 'NOT_PROVIDED');
  console.log('   🚛 E-way Bill URL:', params.ewaybill_url || 'NOT_PROVIDED');
  console.log(
    '✅ [PLASTIKS_REQUEST] CRITICAL: Attachments ARE NOW included in Plastiks submission!'
  );

  try {
    const resp = await client.post('/api/collections/prg', body);

    // 🔍 ADVANCED LOGGING: Log response
    console.log('✅ [PLASTIKS_RESPONSE] PRG Creation Response:');
    console.log('📊 [PLASTIKS_RESPONSE] Status:', resp.status);
    console.log('📋 [PLASTIKS_RESPONSE] Headers:', resp.headers);
    console.log(
      '📦 [PLASTIKS_RESPONSE] Response Body:',
      JSON.stringify(resp.data, null, 2)
    );

    if (!resp.data?.success) throw new Error('plastiks: PRG creation failed');
    return resp.data.collection as PlastiksCollection;
  } catch (e) {
    console.error('❌ [PLASTIKS_ERROR] PRG Creation Failed:', e);
    throw new Error(`plastiks: PRG creation error: ${axiosErrorToString(e)}`);
  }
}

export async function signMetadataHash(
  client: ReturnType<typeof createPlastiksClient>,
  cfg: BlockchainConfig,
  wallet: ethers.Wallet,
  collectionAddress: string
) {
  try {
    // 🔍 ADVANCED LOGGING: Log metadata hash signing
    console.log('🔐 [PLASTIKS_REQUEST] Signing metadata hash...');
    console.log(
      '📦 [PLASTIKS_REQUEST] URL:',
      client.defaults.baseURL +
        `/api/collections/${collectionAddress}/sign_metadata_hash`
    );
    console.log('📋 [PLASTIKS_REQUEST] Params:', {
      contract_address: cfg.plastikCrypto,
    });

    const resp = await client.get(
      `/api/collections/${collectionAddress}/sign_metadata_hash`,
      {
        params: { contract_address: cfg.plastikCrypto },
      }
    );

    console.log('✅ [PLASTIKS_RESPONSE] Metadata hash response:', resp.data);

    const hashToSign: string | undefined = resp.data?.hash_to_sign;
    if (!hashToSign) throw new Error('plastiks: hash_to_sign missing');

    console.log('🔐 [PLASTIKS_REQUEST] Signing hash with wallet...');
    const signature = await wallet.signMessage(ethers.getBytes(hashToSign));

    console.log('📤 [PLASTIKS_REQUEST] Saving metadata signature...');
    const saveResp = await client.post(
      `/api/collections/${collectionAddress}/save_metadata_signature`,
      { signature }
    );

    console.log(
      '✅ [PLASTIKS_RESPONSE] Save signature response:',
      saveResp.data
    );

    if (!saveResp.data?.success)
      throw new Error('plastiks: save_metadata_signature failed');
  } catch (e) {
    console.error('❌ [PLASTIKS_ERROR] Metadata hash signing failed:', e);
    throw new Error(
      `plastiks: sign_metadata_hash error: ${axiosErrorToString(e)}`
    );
  }
}

export async function signFixedPrice(
  client: ReturnType<typeof createPlastiksClient>,
  cfg: BlockchainConfig,
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
    if (!resp.data?.success)
      throw new Error('plastiks: sign_fixed_price failed');
  } catch (e) {
    throw new Error(
      `plastiks: sign_fixed_price error: ${axiosErrorToString(e)}`
    );
  }
}

export async function signVoucher(
  client: ReturnType<typeof createPlastiksClient>,
  cfg: BlockchainConfig,
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

  // 🔍 ADVANCED LOGGING: Log complete row data
  console.log('🎯 [PLASTIKS_SUBMIT] Starting submission to Plastiks');
  console.log('📄 [PLASTIKS_SUBMIT] Invoice:', row.invoice_number);
  console.log('🏢 [PLASTIKS_SUBMIT] Company:', row.recycler_company);
  console.log('📊 [PLASTIKS_SUBMIT] Weight:', row.tonnage_kg, 'kg');
  console.log(
    '🌍 [PLASTIKS_SUBMIT] Location:',
    row.city,
    row.country || row.origin
  );

  // 🔥 ADVANCED LOGGING: Show available attachments that WILL NOW be sent
  console.log(
    '📎 [PLASTIKS_SUBMIT] Available Attachment URLs (NOW being sent to Plastiks):'
  );
  console.log('   📄 Invoice URL:', row.invoice_url);
  console.log('   💳 EFT URL:', row.eft_url);
  console.log('   🚛 E-way Bill URL:', row.ewaybill_url);
  console.log(
    '🔥 [PLASTIKS_SUBMIT] CRITICAL: Attachments ARE NOW included in Plastiks submission!'
  );

  // Build name/description from business data
  const name = `${row.recycler_company} – ${row.invoice_number}`;
  const description = `Recycling proof ${row.plastic_type} ${
    row.tonnage_kg
  }kg, ${row.city || ''} ${row.country || row.origin || ''}`.trim();

  // Map to Plastiks expected labels when possible
  const typeMap: Record<string, string> = {
    PET: 'PET 1',
    PP: 'PP 5',
    PVC: 'PVC 3',
    LDPE: 'LDPE 4',
  };
  const normalizedType = row.plastic_type?.toUpperCase?.() || '';
  const plastiksType = typeMap[normalizedType] || row.plastic_type;

  console.log('📝 [PLASTIKS_SUBMIT] Sending only metadata to Plastiks:');
  console.log('   📛 Name:', name);
  console.log('   📖 Description:', description);
  console.log('   🔬 Plastic Type:', plastiksType);
  console.log('   ⚖️  Weight:', row.tonnage_kg, 'kg');
  console.log('   🏙️  City:', row.city || '');
  console.log('   🌍 Country:', row.country || row.origin || '');

  const prg = await createPrgCollection(client, {
    name,
    description,
    plastik_type: plastiksType,
    weightKg: row.tonnage_kg,
    city: row.city || '',
    country: row.country || row.origin || '',
    // 🔥 NEW: Include attachment URLs
    invoice_url: row.invoice_url,
    eft_url: row.eft_url,
    ewaybill_url: row.ewaybill_url,
  });

  console.log('🔐 [PLASTIKS_SUBMIT] Starting blockchain signing process...');
  await signMetadataHash(client, chain, wallet, prg.address);
  console.log('✅ [PLASTIKS_SUBMIT] Metadata hash signed');

  await signFixedPrice(client, chain, wallet, prg);
  console.log('✅ [PLASTIKS_SUBMIT] Fixed price signed');

  await signVoucher(client, chain, wallet, prg);
  console.log('✅ [PLASTIKS_SUBMIT] Voucher signed');

  console.log('🎉 [PLASTIKS_SUBMIT] Submission completed successfully');
  console.log('📦 [PLASTIKS_SUBMIT] Final PRG Collection:', {
    id: prg.id,
    address: prg.address,
    weight: prg.weight,
    metadata_hash: prg.metadata_hash,
  });

  return prg;
}
