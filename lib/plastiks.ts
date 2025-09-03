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
  network_operator_company?: string;
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
    // process.env.PLASTIKS_BASE_URL || 'https://staging.plastiks.io';
    process.env.PLASTIKS_BASE_URL || 'https://c15d0a96de53.ngrok-free.app';
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
  console.log(`🔧 [PLASTIKS_CLIENT] Creating client for ${config.baseUrl}`);

  const client = axios.create({
    baseURL: config.baseUrl,
    headers: {
      'API-key': config.apiToken,
      'User-Address': config.userAddress,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });

  return client;
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
  const resp = await client.get('/collections/plastic_types');
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
    // Essential fields only - as requested for production
    recycler_company: string;
    invoice_number: string;
    invoice_url?: string;
    eft_url?: string;
    ewaybill_url?: string;
    plastic_type: string;
    origin?: string;
    currency?: string;
    country?: string;
    city?: string;
    weightKg: number;
    network_operator_company?: string;
  }
) {
  // 🎯 COMPLETE PAYLOAD: Include all required Plastiks fields
  const body = {
    // Required by Plastiks API
    name: `${params.recycler_company} - ${params.invoice_number}`,
    description: `Recycling collection for invoice ${params.invoice_number} from ${params.recycler_company}`,
    plastik_type: params.plastic_type, // Note: plastik_type not plastic_type
    instant_sale_price: 1000000000, // 1 Gwei minimum
    no_of_copies: Math.max(1, Math.round(params.weightKg / 1000)), // 1 copy per ton
    weight: params.weightKg,
    use_autogen_image: true,

    // Essential business fields
    recycler_company: params.recycler_company,
    invoice_number: params.invoice_number,
    invoice_url: params.invoice_url || '',
    eft_url: params.eft_url || '',
    ewaybill_url: params.ewaybill_url || '',
    origin: params.origin || '',
    currency: params.currency || '',
    country: params.country || '',
    city: params.city || '',
    network_operator_company: params.network_operator_company || '',
  };

  console.log(
    `🚀 [PLASTIKS_API] Creating PRG collection for ${params.invoice_number}`
  );

  console.log(
    `📋 [PLASTIKS_API] Payload: ${body.weight}kg ${body.plastik_type} from ${body.recycler_company}`
  );

  try {
    const resp = await client.post('/collections/prg', body);

    console.log(
      `✅ [PLASTIKS_API] Success: Collection ID ${resp.data?.collection?.id} created`
    );

    if (!resp.data?.success) throw new Error('plastiks: PRG creation failed');
    return resp.data.collection as PlastiksCollection;
  } catch (e) {
    console.error(
      `❌ [PLASTIKS_API] Error creating collection:`,
      e instanceof Error ? e.message : String(e)
    );

    if (axios.isAxiosError(e)) {
      console.error(
        `❌ [PLASTIKS_API] HTTP ${e.response?.status}: ${e.response?.statusText}`
      );
      if (e.response?.data) {
        console.error(`❌ [PLASTIKS_API] Response:`, e.response.data);
      }
    }

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
        `/collections/${collectionAddress}/sign_metadata_hash`
    );
    console.log('📋 [PLASTIKS_REQUEST] Params:', {
      contract_address: cfg.plastikCrypto,
    });

    const resp = await client.get(
      `/collections/${collectionAddress}/sign_metadata_hash`,
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
      `/collections/${collectionAddress}/save_metadata_signature`,
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
      `/collections/${prg.address}/sign_fixed_price`,
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
    const resp = await client.post(`/collections/${prg.address}/sign_voucher`, {
      sign: signature,
      amount: value.amount,
      tokenId: value.tokenId,
      tokenURI: value.tokenURI,
      tokenAddress: value.tokenAddress,
      creatorAddress: value.creatorAddress,
    });
    if (!resp.data?.success) throw new Error('plastiks: sign_voucher failed');
  } catch (e) {
    throw new Error(`plastiks: sign_voucher error: ${axiosErrorToString(e)}`);
  }
}

export async function submitToPlastiks(document: RecyclingDocRow) {
  console.log(
    `🚀 [PLASTIKS_SUBMIT] Starting submission for ${document.invoice_number}`
  );

  const validationResults = validateDocumentForSubmission(document);
  if (!validationResults.isValid) {
    console.error(
      `❌ [PLASTIKS_SUBMIT] Validation failed:`,
      validationResults.errors
    );
    throw new Error(
      `Document validation failed: ${validationResults.errors.join(', ')}`
    );
  }

  const cfg = getPlastiksConfig();
  const client = createPlastiksClient(cfg);
  const chain = await getBlockchainConfig(client);
  const wallet = new ethers.Wallet(cfg.privateKey);

  console.log(
    `📊 [PLASTIKS_SUBMIT] Document: ${document.recycler_company} | ${document.tonnage_kg}kg | ${document.plastic_type}`
  );

  // Map to Plastiks expected labels when possible
  const typeMap: Record<string, string> = {
    PET: 'PET 1',
    PP: 'PP 5',
    PVC: 'PVC 3',
    LDPE: 'LDPE 4',
  };
  const normalizedType = document.plastic_type?.toUpperCase?.() || '';
  const plastiksType = typeMap[normalizedType] || document.plastic_type;

  const submissionPayload = {
    recycler_company: document.recycler_company || '',
    invoice_number: document.invoice_number || '',
    invoice_url: document.invoice_url,
    eft_url: document.eft_url,
    ewaybill_url: document.ewaybill_url,
    plastic_type: plastiksType,
    origin: document.origin || '',
    currency: document.currency || '',
    country: document.country || '',
    city: document.city || '',
    weightKg: document.tonnage_kg,
    network_operator_company: document.network_operator_company || '',
  };

  const prg = await createPrgCollection(client, submissionPayload);

  console.log('🔐 [PLASTIKS_SUBMIT] Starting blockchain signing process...');
  await signMetadataHash(client, chain, wallet, prg.address);
  await signFixedPrice(client, chain, wallet, prg);
  await signVoucher(client, chain, wallet, prg);

  console.log(
    `🎉 [PLASTIKS_SUBMIT] Completed! Collection ID: ${prg.id} | Address: ${prg.address}`
  );

  return prg;
}

// 🔍 VALIDATION: Helper function to validate document before submission
function validateDocumentForSubmission(document: RecyclingDocRow): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!document.invoice_number?.trim()) {
    errors.push('Invoice number is required');
  }

  if (!document.recycler_company?.trim()) {
    errors.push('Recycler company is required');
  }

  if (!document.plastic_type?.trim()) {
    errors.push('Plastic type is required');
  }

  if (!document.tonnage_kg || document.tonnage_kg <= 0) {
    errors.push('Weight must be greater than 0');
  }

  // Optional but recommended fields
  if (!document.invoice_url?.trim()) {
    warnings.push(
      'Invoice URL is missing - document may not have proper verification'
    );
  }

  if (
    !document.city?.trim() &&
    !document.country?.trim() &&
    !document.origin?.trim()
  ) {
    warnings.push(
      'Location information is missing - no city, country, or origin specified'
    );
  }

  if (!document.network_operator_company?.trim()) {
    warnings.push('Network operator company is not specified');
  }

  // Business logic validation
  if (document.tonnage_kg > 10000) {
    warnings.push(
      'Weight is very high (>10 tons) - please verify this is correct'
    );
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
  };
}
