const axios = require('axios');

async function testPlastiksFlow() {
  console.log('=== TESTING PLASTIKS API FLOW ===\n');

  // Configuration from your .env file
  const config = {
    baseUrl: 'https://stage-app.plastiks.io/api',
    apiToken: 'plastiks_test_api_key_2024',
    userAddress: '0x155398F860C1B19CBb243496D2e6B932eD4aD143',
    privateKey: '0x7a7dbd4ef2be8acef0a120b1d5dda67775f3f1d49204de165f08cf47554184e7'
  };

  // Your actual payload
  const payload = {
    "name": "AERO FIBRE PVT LTD - 202",
    "description": "Recycling collection for invoice 202 from AERO FIBRE PVT LTD",
    "plastik_type": "MIXED",
    "instant_sale_price": 1000000000,
    "no_of_copies": 9,
    "weight": 9935,
    "use_autogen_image": true,
    "recycler_company": "AERO FIBRE PVT LTD",
    "invoice_number": "202",
    "invoice_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/...",
    "eft_url": "",
    "ewaybill_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/...",
    "origin": "IN",
    "currency": "INR",
    "country": "IN",
    "city": "DAMAN",
    "network_operator_company": "A Z SCRAPE CENTER"
  };

  try {
    // Step 1: Test getting blockchain config (this is where your error happens)
    console.log('STEP 1: Getting blockchain configuration...');
    console.log(`URL: ${config.baseUrl}/collections/plastic_types`);

    const configResponse = await axios.get(`${config.baseUrl}/collections/plastic_types`, {
      headers: {
        'API-key': config.apiToken,
        'User-Address': config.userAddress,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Config response received');
    console.log('Celo chain ID:', configResponse.data.celo_chain_id);
    console.log('Using testnet:', configResponse.data.using_testnet);

    const celoAddresses = configResponse.data.contract_addresses?.celo;
    if (!celoAddresses) {
      throw new Error('No Celo contract addresses in response');
    }

    console.log('\nContract addresses found:');
    console.log('- plastik_crypto:', celoAddresses.plastik_crypto);
    console.log('- recycling_nft:', celoAddresses.recycling_nft);
    console.log('- plastik_token:', celoAddresses.plastik_token);

    if (!celoAddresses.plastik_crypto || !celoAddresses.recycling_nft || !celoAddresses.plastik_token) {
      throw new Error('Missing required contract addresses');
    }

    // Step 2: Try to create PRG collection
    console.log('\n\nSTEP 2: Creating PRG collection...');
    console.log(`URL: ${config.baseUrl}/collections/prg`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const prgResponse = await axios.post(`${config.baseUrl}/collections/prg`, payload, {
      headers: {
        'API-key': config.apiToken,
        'User-Address': config.userAddress,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n✅ PRG collection created successfully!');
    console.log('Response:', JSON.stringify(prgResponse.data, null, 2));

    if (prgResponse.data.collection) {
      console.log('\nCollection details:');
      console.log('- ID:', prgResponse.data.collection.id);
      console.log('- Address:', prgResponse.data.collection.address);
      console.log('- Weight:', prgResponse.data.collection.weight);
    }

  } catch (error) {
    console.error('\n❌ ERROR OCCURRED:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);

    if (error.response) {
      console.error('\nAPI Response Error:');
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Headers:', error.response.headers);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('\nNo response received from API');
      console.error('Request:', error.request);
    } else {
      console.error('\nError details:', error);
    }
  }
}

testPlastiksFlow();