const axios = require('axios');

async function testContractAddresses() {
  console.log('=== TESTING CONTRACT_ADDRESSES FROM /plastic_types API ===\n');

  // Test with both URLs to see the difference
  const urls = [
    'https://stage-app.plastiks.io/api',  // Correct URL with /api
    'https://stage-app.plastiks.io'        // URL without /api (what was in .env before)
  ];

  const config = {
    apiToken: 'plastiks_test_api_key_2024',
    userAddress: '0x155398F860C1B19CBb243496D2e6B932eD4aD143',
  };

  for (const baseUrl of urls) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing with base URL: ${baseUrl}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      const fullUrl = `${baseUrl}/collections/plastic_types`;
      console.log(`Full URL: ${fullUrl}`);
      console.log('Making request...\n');

      const response = await axios.get(fullUrl, {
        headers: {
          'API-key': config.apiToken,
          'User-Address': config.userAddress,
          'Content-Type': 'application/json'
        },
        maxRedirects: 0 // Don't follow redirects to see what happens
      });

      console.log('✅ SUCCESS - Response received\n');
      console.log('Response Status:', response.status);
      console.log('Response Headers Content-Type:', response.headers['content-type']);

      if (response.data) {
        console.log('\n📋 FULL RESPONSE DATA:');
        console.log(JSON.stringify(response.data, null, 2));

        console.log('\n🔍 ANALYZING CONTRACT_ADDRESSES OBJECT:');
        const contractAddresses = response.data.contract_addresses;

        if (!contractAddresses) {
          console.log('❌ ERROR: contract_addresses field is missing from response!');
        } else {
          console.log('✅ contract_addresses field exists\n');

          console.log('📦 CONTRACT_ADDRESSES STRUCTURE:');
          console.log(JSON.stringify(contractAddresses, null, 2));

          // Check Celo network addresses (what the code uses)
          console.log('\n🔗 CELO NETWORK ADDRESSES:');
          if (!contractAddresses.celo) {
            console.log('❌ ERROR: contract_addresses.celo is missing!');
          } else {
            const celo = contractAddresses.celo;
            console.log('✅ celo object exists');

            // Check each required field that the code expects
            const requiredFields = [
              'plastik_crypto',
              'recycling_nft',
              'plastik_token'
            ];

            console.log('\nRequired fields check:');
            requiredFields.forEach(field => {
              if (!celo[field]) {
                console.log(`  ❌ ${field}: MISSING or NULL`);
              } else {
                console.log(`  ✅ ${field}: ${celo[field]}`);
              }
            });

            // Check optional fields
            console.log('\nOptional fields:');
            const optionalFields = [
              'plastik_token_decimals',
              'storefront',
              'plastik_role'
            ];

            optionalFields.forEach(field => {
              console.log(`  - ${field}: ${celo[field] || 'NULL'}`);
            });
          }

          // Check BSC network addresses (for comparison)
          console.log('\n🔗 BSC NETWORK ADDRESSES:');
          if (contractAddresses.bsc) {
            const bsc = contractAddresses.bsc;
            console.log(JSON.stringify(bsc, null, 2));
          } else {
            console.log('No BSC addresses configured');
          }
        }

        // Additional validation that matches the code's logic
        console.log('\n🎯 VALIDATION (matching lib/plastiks.ts:108-110):');
        const celo = contractAddresses?.celo;
        if (!celo?.plastik_crypto || !celo?.recycling_nft || !celo?.plastik_token) {
          console.log('❌ VALIDATION FAILED: This would trigger "plastiks: missing contract addresses" error');
          console.log('Missing fields:', {
            plastik_crypto: !celo?.plastik_crypto ? 'MISSING' : 'OK',
            recycling_nft: !celo?.recycling_nft ? 'MISSING' : 'OK',
            plastik_token: !celo?.plastik_token ? 'MISSING' : 'OK'
          });
        } else {
          console.log('✅ VALIDATION PASSED: All required contract addresses are present');
        }
      }

    } catch (error) {
      console.log('❌ REQUEST FAILED\n');

      if (error.response) {
        console.log('Response Status:', error.response.status);
        console.log('Response Status Text:', error.response.statusText);

        if (error.response.status === 302 || error.response.status === 301) {
          console.log('🔄 REDIRECT DETECTED');
          console.log('Location header:', error.response.headers.location);
          console.log('\n⚠️  This means the URL is wrong and redirecting elsewhere');
          console.log('This would cause the "missing contract addresses" error');
        } else {
          console.log('Response Data:', error.response.data);
        }
      } else if (error.code === 'ERR_FR_MAX_REDIRECTS') {
        console.log('🔄 REDIRECT DETECTED (maxRedirects=0 prevented following)');
        console.log('This URL redirects, which means it\'s the wrong endpoint');
      } else {
        console.log('Error:', error.message);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTING COMPLETE');
  console.log('='.repeat(60));
}

testContractAddresses();