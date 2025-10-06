Critical Issues to Address

1. Missing Unique Constraint Handling
   The code assumes the migration has been run, but there's no error handling for constraint violations:
   typescript// Add before the upsert in processDocumentGroup
   const { data: existingGroup } = await supabase
   .from('document_groups')
   .select('id, created_at')
   .eq('user_id', user_id)
   .eq('group_key', groupKey)
   .single();

if (existingGroup) {
console.log(`📝 [grouping:${requestId}] Updating existing group ${groupKey}`);
} 2. Vehicle Number Edge Cases
Your regex pattern might miss some formats:
typescriptfunction normalizeVehicleNumber(vehicle: string | undefined | null): string {
if (!vehicle) return '';

let normalized = vehicle.toUpperCase().trim();

// Remove trip numbers (after 4th segment)
const segments = normalized.split(/[\s-]+/);
if (segments.length > 4) {
normalized = segments.slice(0, 4).join(' ');
}

// Updated pattern to handle more formats
const patterns = [
/^([A-Z]{2})\s*([0-9]{1,2}[A-Z]?)\s*([A-Z]{1,2})?\s*([0-9]{3,4})/, // Standard
/^([A-Z]{2})\s*([0-9]{2})\s\*([0-9]{4})$/,  // Simple format like "MH 09 4547"
    /^([A-Z]{2})-?([0-9]{2})-?([A-Z]{1,2})-?([0-9]{4})$/ // With hyphens
];

for (const pattern of patterns) {
const match = normalized.match(pattern);
if (match) {
return match.slice(1).filter(Boolean).join('');
}
}

return normalized.replace(/[^A-Z0-9]/g, '');
} 3. Add Grouping Version Tracking
Track which version of logic created each group:
typescriptconst groupData = {
user_id,
invoice_number: primaryInvoice || entry.metadata.rawInvoice || groupKey,
group_key: groupKey,
grouping_version: 'v2', // Add this
confidence_score: entry.metadata.quality, // Add this
composite_key_metadata: entry.metadata, // Add this if column exists
// ... rest of fields
}; 4. Performance Optimization
For large document sets, consider batching:
typescript// In processDocumentGroup, batch the upserts
const BATCH_SIZE = 10;
const groupEntries = Object.entries(documentGroups);

for (let i = 0; i < groupEntries.length; i += BATCH*SIZE) {
const batch = groupEntries.slice(i, i + BATCH_SIZE);
await Promise.all(
batch.map(([key, entry]) =>
processDocumentGroup(key, entry, user_id, requestId, supabase)
)
);
}
Testing Queries
Run these after deploying to verify the enhancement:
sql-- 1. Check how many groups were created with new logic
SELECT
COUNT(\*) as total_groups,
COUNT(DISTINCT CASE WHEN group_key LIKE '%*%' THEN group*key END) as composite_groups,
COUNT(DISTINCT CASE WHEN group_key NOT LIKE '%*%' THEN group_key END) as simple_groups
FROM document_groups
WHERE created_at > NOW() - INTERVAL '1 hour';

-- 2. Verify invoice 455 separation
SELECT
invoice_number,
COUNT(DISTINCT group_key) as unique_groups,
ARRAY_AGG(DISTINCT group_key) as group_keys
FROM document_groups
WHERE invoice_number IN ('455', '515', '948')
GROUP BY invoice_number;

-- 3. Check quality distribution
SELECT
CASE
WHEN group*key LIKE '%\_NODATE' THEN 'Missing Date'
WHEN group_key LIKE '%\_NOVEHICLE*%' THEN 'Missing Vehicle'
WHEN group*key LIKE 'NOINV*%' THEN 'Missing Invoice'
WHEN group*key LIKE 'INVONLY*%' THEN 'Invoice Only'
WHEN group*key ~ '^[0-9]{4}*[A-Z0-9]+\_[0-9]{4}-' THEN 'Complete'
ELSE 'Other'
END as group_quality,
COUNT(\*) as count
FROM document_groups
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY group_quality
ORDER BY count DESC;
