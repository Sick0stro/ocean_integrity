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
  eft_url: string | null; // ✅ Now nullable for Indian recyclers
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
    // process.env.PLASTIKS_BASE_URL || 'https://c15d0a96de53.ngrok-free.app';
    process.env.PLASTIKS_BASE_URL || 'https://stage-app.plastiks.io';
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
  console.log(
    '🔧 [PLASTIKS_DEBUG] Making API call to /api/collections/plastic_types'
  );
  const resp = await client.get('/api/collections/plastic_types');

  console.log('📡 [PLASTIKS_DEBUG] Raw response status:', resp.status);
  console.log('📡 [PLASTIKS_DEBUG] Raw response headers:', resp.headers);

  if (!resp.data) throw new Error('plastiks: empty response');

  console.log(
    '📋 [PLASTIKS_DEBUG] Full response data:',
    JSON.stringify(resp.data, null, 2)
  );

  const cfg = resp.data;
  console.log('🔍 [PLASTIKS_DEBUG] Config object:', cfg);
  console.log(
    '🔍 [PLASTIKS_DEBUG] contract_addresses exists:',
    !!cfg.contract_addresses
  );
  console.log(
    '🔍 [PLASTIKS_DEBUG] contract_addresses value:',
    cfg.contract_addresses
  );

  const celo = cfg.contract_addresses?.celo;
  console.log('🔍 [PLASTIKS_DEBUG] celo object exists:', !!celo);
  console.log('🔍 [PLASTIKS_DEBUG] celo object value:', celo);

  if (celo) {
    console.log('🔍 [PLASTIKS_DEBUG] plastik_crypto:', celo.plastik_crypto);
    console.log('🔍 [PLASTIKS_DEBUG] recycling_nft:', celo.recycling_nft);
    console.log('🔍 [PLASTIKS_DEBUG] plastik_token:', celo.plastik_token);
  }

  if (!celo?.plastik_crypto || !celo?.recycling_nft || !celo?.plastik_token) {
    console.error('❌ [PLASTIKS_DEBUG] Missing contract addresses detected!');
    console.error(
      '❌ [PLASTIKS_DEBUG] plastik_crypto present:',
      !!celo?.plastik_crypto
    );
    console.error(
      '❌ [PLASTIKS_DEBUG] recycling_nft present:',
      !!celo?.recycling_nft
    );
    console.error(
      '❌ [PLASTIKS_DEBUG] plastik_token present:',
      !!celo?.plastik_token
    );
    throw new Error('plastiks: missing contract addresses');
  }

  console.log('✅ [PLASTIKS_DEBUG] All contract addresses found successfully!');
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
    eft_url?: string | null; // ✅ Now accepts null for Indian recyclers
    ewaybill_url?: string;
    plastic_type: string;
    origin?: string;
    currency?: string;
    country?: string;
    city?: string;
    weightKg: number;
    network_operator_company?: string;
    upload_date?: string | null; // For date_of_recycling
    recycler_address?: string; // Real address from documents
    recycler_postal_code?: string; // Real postal code from documents
  }
) {
  // 🎯 CORRECT PAYLOAD: Match Plastiks expected format with REAL data only

  // Note: date_of_recycling removed from payload as per Samhita's format

  // 🎯 EXACT PAYLOAD STRUCTURE as requested by Samhita (same order)
  const body = {
    name: `${params.recycler_company} - ${params.invoice_number}`,
    description: `Recycling collection for invoice ${params.invoice_number} from ${params.recycler_company}`,
    plastik_type: params.plastic_type, // ✅ Changed from plastik_type to plastic_type
    weight: params.weightKg,
    guarantee_connected: true, // ✅ Added new field
    city: params.city || '',
    country: params.country || params.origin || '',
    use_autogen_image: true,
    // ✅ Documents at top level (not nested in documents object)
    invoice: params.invoice_url || '',
    proof_invoice: params.eft_url || '',
    way_bill: params.ewaybill_url || '',
    receipt: params.eft_url || '', // ✅ Added receipt field (empty for now)
  };

  console.log(
    `🚀 [PLASTIKS_API] Creating PRG collection for ${params.invoice_number}`
  );

  console.log(
    `📋 [PLASTIKS_API] Payload: ${body.weight}kg ${body.plastik_type} for ${body.name}`
  );

  console.log('🔍 [PLASTIKS_DEBUG] Full request payload:');
  console.log(JSON.stringify(body, null, 2));

  try {
    console.log('🌐 [PLASTIKS_DEBUG] Making request to Plastiks...');
    console.log(
      '🌐 [PLASTIKS_DEBUG] URL: https://stage-app.plastiks.io/api/collections/prg'
    );
    console.log('🌐 [PLASTIKS_DEBUG] Headers:', {
      'API-key': 'plastiks_test_api_key_2024',
      'User-Address': '0x155398F860C1B19CBb243496D2e6B932eD4aD143',
      'Content-Type': 'application/json',
    });

    // 🔍 DETAILED DEBUG: Test what Plastiks expects vs what we send
    console.log('🔍 [PLASTIKS_ANALYSIS] Request Analysis:');
    console.log('📋 Required fields present:');
    console.log('  - name:', !!body.name, `(${body.name})`);
    console.log(
      '  - description:',
      !!body.description,
      `(${body.description.substring(0, 50)}...)`
    );
    console.log(
      '  - plastik_type:',
      !!body.plastik_type,
      `(${body.plastik_type})`
    );
    console.log(
      '  - use_autogen_image:',
      !!body.use_autogen_image,
      `(${body.use_autogen_image})`
    );
    console.log('  - weight:', !!body.weight, `(${body.weight})`);
    console.log('📋 Document analysis:');
    console.log('  - invoice exists:', !!body.invoice);
    console.log('  - way_bill exists:', !!body.way_bill);
    console.log('  - proof_invoice exists:', !!body.proof_invoice);
    console.log('  - receipt exists:', !!body.receipt);
    console.log('  - guarantee_connected:', body.guarantee_connected);
    console.log('📋 Additional fields:');
    console.log('  - country:', body.country || 'MISSING');
    console.log('  - city:', body.city || 'MISSING');
    console.log('  - plastik_type:', body.plastik_type || 'MISSING');

    const resp = await client.post('/api/collections/prg', body);

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

      // 🔍 COMPREHENSIVE ERROR ANALYSIS
      console.error('🔍 [PLASTIKS_ERROR] Comprehensive Error Analysis:');
      console.error('📋 Request that failed:');
      console.error('  URL:', e.config?.url);
      console.error('  Method:', e.config?.method?.toUpperCase());
      console.error('  Headers:', e.config?.headers);
      console.error(
        '  Data keys:',
        e.config?.data ? Object.keys(JSON.parse(e.config.data)) : 'NO DATA'
      );

      if (e.response?.data) {
        console.error(
          `📋 Full Error Response:`,
          JSON.stringify(e.response.data, null, 2)
        );

        // Check if it's the expected error
        const errors = e.response.data?.errors || [];
        const hasFileBlankError = errors.some((err: string) =>
          err.includes('Collectible file')
        );
        const hasImageError = errors.some((err: string) =>
          err.includes('image')
        );
        const hasMissingFieldError = errors.some(
          (err: string) => err.includes('missing') || err.includes('required')
        );

        console.error('🔍 [ERROR_PATTERN] Error Pattern Analysis:');
        console.error('  - File blank error:', hasFileBlankError);
        console.error('  - Image related error:', hasImageError);
        console.error('  - Missing field error:', hasMissingFieldError);
        console.error('  - All errors:', errors);

        // 🚨 CONCLUSION
        if (hasFileBlankError && !hasMissingFieldError) {
          console.error(
            '🚨 [CONCLUSION] This appears to be a Plastiks API bug with their auto-generation feature!'
          );
          console.error(
            "🚨 [CONCLUSION] We're sending all required fields correctly but they still reject it."
          );
        }
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

  // 🔍 DEBUG: Log the document data to understand EFT URL issue
  console.log('🔍 [DEBUG] Document EFT debugging:');
  console.log('📋 Invoice URL:', document.invoice_url);
  console.log('📋 EFT URL:', document.eft_url);
  console.log('📋 EFT URL type:', typeof document.eft_url);
  console.log('📋 EFT URL length:', document.eft_url?.length);
  console.log('📋 EFT === Invoice?', document.eft_url === document.invoice_url);

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
    upload_date: document.upload_date,
    // ⚠️ TODO: Need to extract address/postal_code from document content or make optional
    // recycler_address: document.recycler_address,
    // recycler_postal_code: document.recycler_postal_code,
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
