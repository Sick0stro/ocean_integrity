const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testPlastiksWithDifferentPayloads() {
  console.log('=== TESTING DIFFERENT PLASTIKS PAYLOADS ===\n');

  const config = {
    baseUrl: 'https://stage-app.plastiks.io/api',
    apiToken: 'plastiks_test_api_key_2024',
    userAddress: '0x155398F860C1B19CBb243496D2e6B932eD4aD143',
  };

  // Test 1: With collectible_file field
  console.log('TEST 1: Adding collectible_file field...');
  try {
    const payload1 = {
      "name": "AERO FIBRE PVT LTD - 202",
      "description": "Recycling collection for invoice 202 from AERO FIBRE PVT LTD",
      "plastik_type": "MIXED",
      "instant_sale_price": 1000000000,
      "no_of_copies": 9,
      "weight": 9935,
      "use_autogen_image": true,
      "collectible_file": "", // Empty string to see if it changes error
      "recycler_company": "AERO FIBRE PVT LTD",
      "invoice_number": "202",
      "invoice_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test.pdf",
      "eft_url": "",
      "ewaybill_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test2.pdf",
      "origin": "IN",
      "currency": "INR",
      "country": "IN",
      "city": "DAMAN",
      "network_operator_company": "A Z SCRAPE CENTER"
    };

    const response1 = await axios.post(`${config.baseUrl}/collections/prg`, payload1, {
      headers: {
        'API-key': config.apiToken,
        'User-Address': config.userAddress,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success with collectible_file!');
    console.log('Response:', JSON.stringify(response1.data, null, 2));
  } catch (error) {
    console.log('❌ Failed with collectible_file');
    if (error.response?.data) {
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    }
  }

  // Test 2: Try with image field
  console.log('\nTEST 2: Adding image field...');
  try {
    const payload2 = {
      "name": "AERO FIBRE PVT LTD - 202",
      "description": "Recycling collection for invoice 202 from AERO FIBRE PVT LTD",
      "plastik_type": "MIXED",
      "instant_sale_price": 1000000000,
      "no_of_copies": 9,
      "weight": 9935,
      "use_autogen_image": false, // Set to false when providing image
      "image": "https://via.placeholder.com/400", // Placeholder image URL
      "recycler_company": "AERO FIBRE PVT LTD",
      "invoice_number": "202",
      "invoice_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test.pdf",
      "eft_url": "",
      "ewaybill_url": "https://vmycmabjfzgkephnaxpu.supabase.co/storage/v1/object/public/documents/test2.pdf",
      "origin": "IN",
      "currency": "INR",
      "country": "IN",
      "city": "DAMAN",
      "network_operator_company": "A Z SCRAPE CENTER"
    };

    const response2 = await axios.post(`${config.baseUrl}/collections/prg`, payload2, {
      headers: {
        'API-key': config.apiToken,
        'User-Address': config.userAddress,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success with image!');
    console.log('Response:', JSON.stringify(response2.data, null, 2));
  } catch (error) {
    console.log('❌ Failed with image field');
    if (error.response?.data) {
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    }
  }

  // Test 3: Check if API expects multipart/form-data
  console.log('\nTEST 3: Testing with multipart/form-data...');
  try {
    const form = new FormData();
    form.append('name', 'AERO FIBRE PVT LTD - 202');
    form.append('description', 'Recycling collection for invoice 202 from AERO FIBRE PVT LTD');
    form.append('plastik_type', 'MIXED');
    form.append('instant_sale_price', '1000000000');
    form.append('no_of_copies', '9');
    form.append('weight', '9935');
    form.append('use_autogen_image', 'true');
    form.append('recycler_company', 'AERO FIBRE PVT LTD');
    form.append('invoice_number', '202');
    form.append('origin', 'IN');
    form.append('currency', 'INR');
    form.append('country', 'IN');
    form.append('city', 'DAMAN');
    form.append('network_operator_company', 'A Z SCRAPE CENTER');

    const response3 = await axios.post(`${config.baseUrl}/collections/prg`, form, {
      headers: {
        ...form.getHeaders(),
        'API-key': config.apiToken,
        'User-Address': config.userAddress,
      }
    });

    console.log('✅ Success with multipart/form-data!');
    console.log('Response:', JSON.stringify(response3.data, null, 2));
  } catch (error) {
    console.log('❌ Failed with multipart/form-data');
    if (error.response?.data) {
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPlastiksWithDifferentPayloads();