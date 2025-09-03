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
  console.log('🔧 [CLIENT] Creating Plastiks HTTP client...');
  console.log('   🌐 Base URL:', config.baseUrl);
  console.log('   🔑 API Token present:', !!config.apiToken);
  console.log('   🔑 API Token length:', config.apiToken?.length || 'N/A');
  console.log('   👤 User Address present:', !!config.userAddress);
  console.log(
    '   👤 User Address (first 10):',
    config.userAddress?.substring(0, 10) + '...' || 'N/A'
  );

  const client = axios.create({
    baseURL: config.baseUrl,
    headers: {
      'API-key': config.apiToken,
      'User-Address': config.userAddress,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });

  console.log('✅ [CLIENT] Plastiks HTTP client created successfully');
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

  // 🔍 DEBUG LOGGING: Complete request details for 401 debugging
  console.log('🚀 [PLASTIKS_REQUEST] ======================================');
  console.log('🚀 [PLASTIKS_REQUEST] PLASTIKS API REQUEST DEBUG LOG');
  console.log('🚀 [PLASTIKS_REQUEST] ======================================');
  console.log('📊 [PLASTIKS_REQUEST] Request Method: POST');
  console.log(
    '📦 [PLASTIKS_REQUEST] Full Target URL:',
    client.defaults.baseURL + '/collections/prg'
  );
  console.log('🌐 [PLASTIKS_REQUEST] Base URL:', client.defaults.baseURL);
  console.log('📍 [PLASTIKS_REQUEST] Endpoint Path: /collections/prg');
  console.log('⏰ [PLASTIKS_REQUEST] Timestamp:', new Date().toISOString());

  // Log all client default headers
  console.log('📋 [PLASTIKS_REQUEST] CLIENT DEFAULT HEADERS:');
  Object.entries(client.defaults.headers).forEach(([key, value]) => {
    if (
      key.toLowerCase().includes('api-key') ||
      key.toLowerCase().includes('authorization')
    ) {
      console.log(`   ${key}: [REDACTED_FOR_SECURITY]`);
    } else {
      console.log(`   ${key}: ${value}`);
    }
  });

  // Log specific important headers
  console.log('🔐 [PLASTIKS_REQUEST] AUTHENTICATION HEADERS:');
  console.log(
    '   API-key:',
    client.defaults.headers['API-key']
      ? '✅ PRESENT (length: ' +
          String(client.defaults.headers['API-key']).length +
          ')'
      : '❌ MISSING'
  );
  console.log(
    '   User-Address:',
    client.defaults.headers['User-Address']
      ? '✅ PRESENT (' + client.defaults.headers['User-Address'] + ')'
      : '❌ MISSING'
  );
  console.log(
    '   Content-Type:',
    client.defaults.headers['Content-Type'] || 'NOT_SET'
  );

  // Log complete payload
  console.log('📋 [PLASTIKS_REQUEST] COMPLETE REQUEST PAYLOAD:');
  console.log(JSON.stringify(body, null, 2));

  // Log payload summary
  console.log('📊 [PLASTIKS_REQUEST] PAYLOAD SUMMARY:');
  console.log('   📄 Invoice Number:', body.invoice_number);
  console.log('   🏢 Recycler Company:', body.recycler_company);
  console.log('   🔬 Plastic Type:', body.plastik_type);
  console.log('   ⚖️  Weight (kg):', body.weight);
  console.log('   💰 Instant Sale Price:', body.instant_sale_price);
  console.log('   📋 Number of Copies:', body.no_of_copies);
  console.log('   🎨 Use Auto Gen Image:', body.use_autogen_image);

  // Log attachments
  console.log('📎 [PLASTIKS_REQUEST] ATTACHMENTS IN PAYLOAD:');
  console.log(
    '   📄 Invoice URL:',
    body.invoice_url ? '✅ INCLUDED' : '❌ EMPTY'
  );
  console.log('   💳 EFT URL:', body.eft_url ? '✅ INCLUDED' : '❌ EMPTY');
  console.log(
    '   🚛 E-way Bill URL:',
    body.ewaybill_url ? '✅ INCLUDED' : '❌ EMPTY'
  );

  // Log business fields
  console.log('🏢 [PLASTIKS_REQUEST] BUSINESS FIELDS:');
  console.log('   🌍 Origin:', body.origin || 'NOT_SET');
  console.log('   🌍 Country:', body.country || 'NOT_SET');
  console.log('   🏙️  City:', body.city || 'NOT_SET');
  console.log('   💰 Currency:', body.currency || 'NOT_SET');
  console.log(
    '   🏢 Network Operator:',
    body.network_operator_company || 'NOT_SET'
  );

  try {
    console.log('🚀 [PLASTIKS_REQUEST] EXECUTING HTTP REQUEST...');
    console.log(
      '   📡 Final URL:',
      client.defaults.baseURL + '/collections/prg'
    );
    console.log(
      '   📊 Payload Size:',
      JSON.stringify(body).length,
      'characters'
    );
    console.log(
      '   🔑 API Key Status:',
      client.defaults.headers['API-key'] ? '✅ SET' : '❌ MISSING'
    );
    console.log(
      '   👤 User Address Status:',
      client.defaults.headers['User-Address'] ? '✅ SET' : '❌ MISSING'
    );

    const resp = await client.post('/collections/prg', body);

    // 🔍 SUCCESS RESPONSE LOGGING
    console.log(
      '✅ [PLASTIKS_RESPONSE] ======================================'
    );
    console.log('✅ [PLASTIKS_RESPONSE] SUCCESSFUL RESPONSE RECEIVED');
    console.log(
      '✅ [PLASTIKS_RESPONSE] ======================================'
    );
    console.log('📊 [PLASTIKS_RESPONSE] HTTP Status Code:', resp.status);
    console.log('📊 [PLASTIKS_RESPONSE] HTTP Status Text:', resp.statusText);
    console.log(
      '⏰ [PLASTIKS_RESPONSE] Response Time:',
      new Date().toISOString()
    );

    // Log response headers
    console.log('📋 [PLASTIKS_RESPONSE] RESPONSE HEADERS:');
    Object.entries(resp.headers).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });

    // Log response data
    console.log('📦 [PLASTIKS_RESPONSE] COMPLETE RESPONSE BODY:');
    console.log(JSON.stringify(resp.data, null, 2));

    // Log key response details
    console.log('🔍 [PLASTIKS_RESPONSE] RESPONSE ANALYSIS:');
    console.log('   ✅ Success Flag:', resp.data?.success);
    console.log(
      '   🆔 Collection ID:',
      resp.data?.collection?.id || 'NOT_FOUND'
    );
    console.log(
      '   📍 Collection Address:',
      resp.data?.collection?.address || 'NOT_FOUND'
    );
    console.log('   ⚖️  Weight:', resp.data?.collection?.weight || 'NOT_FOUND');
    console.log(
      '   🔗 Metadata Hash:',
      resp.data?.collection?.metadata_hash || 'NOT_FOUND'
    );
    console.log(
      '   🖼️  Image Hash:',
      resp.data?.collection?.image_hash || 'NOT_FOUND'
    );

    console.log(
      '🧪 [TEST] SUCCESS: Plastiks API call completed with status',
      resp.status
    );

    if (!resp.data?.success) throw new Error('plastiks: PRG creation failed');
    return resp.data.collection as PlastiksCollection;
  } catch (e) {
    console.error('❌ [PLASTIKS_ERROR] ======================================');
    console.error('❌ [PLASTIKS_ERROR] PLASTIKS API REQUEST FAILED');
    console.error('❌ [PLASTIKS_ERROR] ======================================');
    console.error('⏰ [PLASTIKS_ERROR] Error Time:', new Date().toISOString());
    console.error(
      '🔥 [PLASTIKS_ERROR] Error Type:',
      e instanceof Error ? e.constructor.name : typeof e
    );
    console.error(
      '📝 [PLASTIKS_ERROR] Error Message:',
      e instanceof Error ? e.message : String(e)
    );

    // 🔍 COMPREHENSIVE ERROR LOGGING FOR 401 DEBUGGING
    if (axios.isAxiosError(e)) {
      console.error('📡 [PLASTIKS_ERROR] HTTP ERROR ANALYSIS:');
      console.error(
        '   🚫 HTTP Status Code:',
        e.response?.status || 'NO_RESPONSE'
      );
      console.error(
        '   🚫 HTTP Status Text:',
        e.response?.statusText || 'NO_RESPONSE'
      );

      // Special handling for 401 errors
      if (e.response?.status === 401) {
        console.error('🚨 [PLASTIKS_ERROR] 401 UNAUTHORIZED ERROR DETECTED!');
        console.error('   💡 Possible causes:');
        console.error('      - Missing or invalid API key');
        console.error('      - Missing or invalid User-Address');
        console.error('      - Wrong endpoint URL');
        console.error('      - API key expired');
        console.error('      - User address format incorrect');
      }

      // Log response headers
      console.error('📋 [PLASTIKS_ERROR] RESPONSE HEADERS:');
      if (e.response?.headers) {
        Object.entries(e.response.headers).forEach(([key, value]) => {
          console.error(`   ${key}: ${value}`);
        });
      } else {
        console.error('   (No response headers received)');
      }

      // Log response data
      console.error('📦 [PLASTIKS_ERROR] RESPONSE BODY:');
      if (e.response?.data) {
        console.error(JSON.stringify(e.response.data, null, 2));
      } else {
        console.error('   (No response body received)');
      }

      // Log request configuration
      console.error('🔧 [PLASTIKS_ERROR] REQUEST CONFIGURATION:');
      console.error('   🔗 Request URL:', e.config?.url || 'NOT_SET');
      console.error('   📤 Request Method:', e.config?.method || 'NOT_SET');
      console.error('   🌍 Base URL:', e.config?.baseURL || 'NOT_SET');
      console.error('   ⏱️  Timeout:', e.config?.timeout || 'NOT_SET');

      // Log request headers (with security)
      console.error('📊 [PLASTIKS_ERROR] REQUEST HEADERS:');
      if (e.config?.headers) {
        Object.entries(e.config.headers).forEach(([key, value]) => {
          if (
            key.toLowerCase().includes('api-key') ||
            key.toLowerCase().includes('authorization')
          ) {
            console.error(`   ${key}: [REDACTED_FOR_SECURITY]`);
          } else {
            console.error(`   ${key}: ${value}`);
          }
        });
      } else {
        console.error('   (No request headers found)');
      }

      // Log request data
      console.error('📝 [PLASTIKS_ERROR] REQUEST PAYLOAD:');
      if (e.config?.data) {
        console.error(JSON.stringify(JSON.parse(e.config.data), null, 2));
      } else {
        console.error('   (No request data found)');
      }
    } else {
      console.error('📡 [PLASTIKS_ERROR] NON-HTTP ERROR:');
      console.error(
        '   This error is not an HTTP error, might be network or configuration issue'
      );
      if (e instanceof Error && e.stack) {
        console.error('   📚 Stack Trace:');
        console.error(e.stack);
      }
    }

    console.error(
      '🧪 [TEST] FAILURE: Plastiks API call failed - check logs above for details'
    );

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
  console.log('🚀 [PLASTIKS] =================================');
  console.log('🚀 [PLASTIKS] STARTING SUBMISSION TO PLASTIKS');
  console.log('🚀 [PLASTIKS] =================================');
  console.log(
    '🧪 [TEST] Plastiks submission initiated for invoice:',
    document.invoice_number
  );
  console.log(
    '🧪 [TEST] Full document data:',
    JSON.stringify(document, null, 2)
  );

  // 📋 VALIDATION & TRACKING: Check document completeness
  const validationResults = validateDocumentForSubmission(document);
  console.log(
    '🔍 [VALIDATION] Document validation results:',
    validationResults
  );

  if (!validationResults.isValid) {
    console.error(
      '❌ [VALIDATION] Document failed validation:',
      validationResults.errors
    );
    throw new Error(
      `Document validation failed: ${validationResults.errors.join(', ')}`
    );
  }

  console.log('✅ [VALIDATION] Document passed all validation checks');

  // 🔧 CONFIGURATION: Initialize Plastiks connection
  console.log('🔧 [CONFIG] Initializing Plastiks configuration...');
  const cfg = getPlastiksConfig();
  const client = createPlastiksClient(cfg);
  const chain = await getBlockchainConfig(client);
  const wallet = new ethers.Wallet(cfg.privateKey);
  console.log('✅ [CONFIG] Plastiks configuration initialized successfully');

  // 📊 DOCUMENT SUMMARY: Log key document data for testing
  console.log(
    '📊 [DOCUMENT] Invoice:',
    document.invoice_number,
    '| Company:',
    document.recycler_company,
    '| Weight:',
    document.tonnage_kg,
    'kg'
  );

  // 📎 ATTACHMENTS: Track attachments status
  const attachmentCount = [
    document.invoice_url,
    document.eft_url,
    document.ewaybill_url,
  ].filter(Boolean).length;
  console.log(`📎 [ATTACHMENTS] ${attachmentCount}/3 attachments provided`);

  // 🎯 PREPARATION: Build submission payload
  console.log('🎯 [PREPARATION] Building submission payload...');
  const name = `${document.recycler_company} – ${document.invoice_number}`;
  const description = `Recycling proof ${document.plastic_type} ${
    document.tonnage_kg
  }kg, ${document.city || ''} ${
    document.country || document.origin || ''
  }`.trim();

  // Map to Plastiks expected labels when possible
  const typeMap: Record<string, string> = {
    PET: 'PET 1',
    PP: 'PP 5',
    PVC: 'PVC 3',
    LDPE: 'LDPE 4',
  };
  const normalizedType = document.plastic_type?.toUpperCase?.() || '';
  const plastiksType = typeMap[normalizedType] || document.plastic_type;

  console.log('📝 [PREPARATION] Payload details:');
  console.log('   📛 Collection Name:', name);
  console.log('   📖 Description:', description);
  console.log(
    '   🔬 Mapped Plastic Type:',
    `${document.plastic_type} → ${plastiksType}`
  );
  console.log('   ⚖️  Weight (kg):', document.tonnage_kg);

  // 🚀 SUBMISSION: Create PRG Collection
  console.log('🚀 [SUBMISSION] Creating PRG Collection...');
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

  console.log(
    '📤 [SUBMISSION] Final payload being sent:',
    JSON.stringify(submissionPayload, null, 2)
  );

  const prg = await createPrgCollection(client, submissionPayload);

  console.log('✅ [SUBMISSION] PRG Collection created successfully:', {
    id: prg.id,
    address: prg.address,
    weight: prg.weight,
  });

  // 🔐 BLOCKCHAIN: Start signing process
  console.log('🔐 [BLOCKCHAIN] =================================');
  console.log('🔐 [BLOCKCHAIN] STARTING BLOCKCHAIN SIGNING');
  console.log('🔐 [BLOCKCHAIN] =================================');

  console.log('🔐 [BLOCKCHAIN] Step 1/3: Signing metadata hash...');
  await signMetadataHash(client, chain, wallet, prg.address);
  console.log('✅ [BLOCKCHAIN] Step 1/3: Metadata hash signed successfully');

  console.log('🔐 [BLOCKCHAIN] Step 2/3: Signing fixed price...');
  await signFixedPrice(client, chain, wallet, prg);
  console.log('✅ [BLOCKCHAIN] Step 2/3: Fixed price signed successfully');

  console.log('🔐 [BLOCKCHAIN] Step 3/3: Signing voucher...');
  await signVoucher(client, chain, wallet, prg);
  console.log('✅ [BLOCKCHAIN] Step 3/3: Voucher signed successfully');

  // 🎉 SUCCESS: Final results
  console.log('🎉 [SUCCESS] Plastiks submission completed!');
  console.log('   🆔 Collection ID:', prg.id, '| Address:', prg.address);
  console.log(
    '🧪 [TEST] SUCCESS: Plastiks submission completed for invoice:',
    document.invoice_number
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
