'use client';

import React, { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieLabelRenderProps,
} from 'recharts';

interface DashboardViewProps {
  session: Session;
}

interface DashboardMetrics {
  kpis: {
    totalRecords: number;
    totalWeightMT: number;
    compliantRecords: number;
    flaggedRecords: number;
    percentageFlagged: number;
    activeUsers: number;
    dateRange: { start: string; end: string };
  };
  compliantRecords: Array<Record<string, unknown>>;
  flaggedRecords: Array<Record<string, unknown>>;
  plasticTypeDistribution: Array<{ plastic_type: string; total_mt: number }>;
  topRecyclers: Array<{
    company: string;
    total_mt: number;
    flagged_count: number;
    compliant_pct: string;
  }>;
  flagReasonBreakdown: Array<{
    reason: string;
    count: number;
    total_mt: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    matched_mt: number;
    flagged_mt: number;
  }>;
}

export default function DashboardView({ session }: DashboardViewProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]);

  const fetchDashboardMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/data/dashboard-metrics?user_id=${session.user.id}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }

      const data = await response.json();

      // 🔍 INTELLIGENT STATUS DETECTION
      // If we have zero records, check if parsed_documents exist (matching might be pending)
      if (data.kpis.totalRecords === 0) {
        try {
          const parsedCheck = await fetch(
            `/api/data/parsed-count?user_id=${session.user.id}`
          );

          if (parsedCheck.ok) {
            const { count } = await parsedCheck.json();

            if (count > 0) {
              console.log(
                `⏳ Dashboard: Found ${count} parsed documents but no matched records. Matching may be in progress.`
              );
              setError(
                `Matching in progress (${count} documents pending). Please wait a moment and refresh.`
              );
            }
          }
        } catch (parsedCheckError) {
          console.warn(
            'Failed to check parsed document count:',
            parsedCheckError
          );
          // Don't fail the whole request if this check fails
        }
      }

      setMetrics(data);
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = async (type: 'compliant' | 'flagged') => {
    try {
      const response = await fetch(
        `/api/data/export-csv?user_id=${session.user.id}&type=${type}`
      );

      if (!response.ok) {
        throw new Error('Failed to download CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_records_${
        new Date().toISOString().split('T')[0]
      }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Error downloading ${type} CSV:`, err);
      alert(`Failed to download ${type} CSV`);
    }
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <span className='ml-3 text-slate-600'>Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    // Check if it's a "matching in progress" message (yellow warning) or actual error (red)
    const isMatchingInProgress = error.includes('Matching in progress');
    const cardClassName = isMatchingInProgress
      ? 'border-yellow-200 bg-yellow-50'
      : 'border-red-200 bg-red-50';
    const titleClassName = isMatchingInProgress
      ? 'text-yellow-700'
      : 'text-red-700';
    const descClassName = isMatchingInProgress
      ? 'text-yellow-600'
      : 'text-red-600';
    const title = isMatchingInProgress
      ? 'Dashboard Updating'
      : 'Error Loading Dashboard';

    return (
      <Card className={cardClassName}>
        <CardHeader>
          <CardTitle className={titleClassName}>{title}</CardTitle>
          <CardDescription className={descClassName}>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchDashboardMetrics} variant='outline'>
            {isMatchingInProgress ? 'Refresh Dashboard' : 'Retry'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Data Available</CardTitle>
          <CardDescription>
            Process some documents to see dashboard analytics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header with Date Range */}
      <div className='flex justify-between items-center'>
        <div>
          <h2 className='text-2xl font-bold text-slate-900'>
            ♻️ Analytics Dashboard
          </h2>
          {metrics.kpis.dateRange.start && (
            <p className='text-sm text-slate-600 mt-1'>
              Period:{' '}
              {new Date(metrics.kpis.dateRange.start).toLocaleDateString()} –{' '}
              {new Date(metrics.kpis.dateRange.end).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className='flex gap-2'>
          <Button
            onClick={() => downloadCSV('compliant')}
            variant='outline'
            size='sm'
          >
            📥 Download Compliant CSV
          </Button>
          <Button
            onClick={() => downloadCSV('flagged')}
            variant='outline'
            size='sm'
          >
            📥 Download Flagged CSV
          </Button>
          <Button onClick={fetchDashboardMetrics} variant='outline' size='sm'>
            🔄 Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className='grid grid-cols-1 md:grid-cols-6 gap-4'>
        <Card className='border-2 border-gray-300'>
          <CardContent className='pt-6 text-center'>
            <div className='text-3xl mb-2'>📦</div>
            <div className='text-sm font-medium text-gray-600'>
              Total Records
            </div>
            <div className='text-2xl font-bold text-gray-900 mt-1'>
              {metrics.kpis.totalRecords.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className='border-2 border-orange-300'>
          <CardContent className='pt-6 text-center'>
            <div className='text-3xl mb-2'>⚖️</div>
            <div className='text-sm font-medium text-orange-600'>
              Total Weight (MT)
            </div>
            <div className='text-2xl font-bold text-orange-900 mt-1'>
              {metrics.kpis.totalWeightMT.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className='border-2 border-green-300'>
          <CardContent className='pt-6 text-center'>
            <div className='text-3xl mb-2'>✅</div>
            <div className='text-sm font-medium text-green-600'>
              Compliant Records
            </div>
            <div className='text-2xl font-bold text-green-900 mt-1'>
              {metrics.kpis.compliantRecords.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className='border-2 border-red-300'>
          <CardContent className='pt-6 text-center'>
            <div className='text-3xl mb-2'>🚩</div>
            <div className='text-sm font-medium text-red-600'>
              Flagged Records
            </div>
            <div className='text-2xl font-bold text-red-900 mt-1'>
              {metrics.kpis.flaggedRecords.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className='border-2 border-red-300'>
          <CardContent className='pt-6 text-center'>
            <div className='text-3xl mb-2'>📊</div>
            <div className='text-sm font-medium text-red-600'>% Flagged</div>
            <div className='text-2xl font-bold text-red-900 mt-1'>
              {metrics.kpis.percentageFlagged.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card className='border-2 border-purple-300'>
          <CardContent className='pt-6 text-center'>
            <div className='text-3xl mb-2'>👥</div>
            <div className='text-sm font-medium text-purple-600'>
              Active Users
            </div>
            <div className='text-2xl font-bold text-purple-900 mt-1'>
              {metrics.kpis.activeUsers.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliant Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>✅ Compliant Records</CardTitle>
          <CardDescription>
            Documents with exact weight match between invoice and eway bill
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.compliantRecords.length > 0 ? (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left p-2 font-medium'>Invoice</th>
                    <th className='text-left p-2 font-medium'>Eway Bill</th>
                    <th className='text-left p-2 font-medium'>Weight (MT)</th>
                    <th className='text-left p-2 font-medium'>From Company</th>
                    <th className='text-left p-2 font-medium'>To Company</th>
                    <th className='text-left p-2 font-medium'>Plastic Type</th>
                    <th className='text-left p-2 font-medium'>Country</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.compliantRecords.slice(0, 10).map((record, idx) => (
                    <tr key={idx} className='border-t hover:bg-slate-50'>
                      <td className='p-2'>
                        <a
                          href={record.invoice_file_url as string}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-blue-600 hover:underline'
                        >
                          📄 View
                        </a>
                      </td>
                      <td className='p-2'>
                        <a
                          href={record.eway_file_url as string}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-blue-600 hover:underline'
                        >
                          📄 View
                        </a>
                      </td>
                      <td className='p-2'>
                        {record.invoice_weight_mt as number}
                      </td>
                      <td className='p-2'>
                        {record.bill_from_company as string}
                      </td>
                      <td className='p-2'>
                        {record.ship_to_company as string}
                      </td>
                      <td className='p-2'>{record.plastic_type as string}</td>
                      <td className='p-2'>{record.country as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.compliantRecords.length > 10 && (
                <p className='text-sm text-slate-600 mt-2 text-center'>
                  Showing 10 of {metrics.compliantRecords.length} records.
                  Download CSV for full data.
                </p>
              )}
            </div>
          ) : (
            <p className='text-slate-600'>No compliant records found.</p>
          )}
        </CardContent>
      </Card>

      {/* Flagged Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>🚩 Flagged Records</CardTitle>
          <CardDescription>
            Documents with mismatches requiring review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.flaggedRecords.length > 0 ? (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left p-2 font-medium'>Invoice</th>
                    <th className='text-left p-2 font-medium'>Eway Bill</th>
                    <th className='text-left p-2 font-medium'>Weight (MT)</th>
                    <th className='text-left p-2 font-medium'>From Company</th>
                    <th className='text-left p-2 font-medium'>Flag Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.flaggedRecords.slice(0, 10).map((record, idx) => (
                    <tr key={idx} className='border-t hover:bg-red-50'>
                      <td className='p-2'>
                        <a
                          href={record.invoice_file_url as string}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-blue-600 hover:underline'
                        >
                          📄 View
                        </a>
                      </td>
                      <td className='p-2'>
                        <a
                          href={record.eway_file_url as string}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-blue-600 hover:underline'
                        >
                          📄 View
                        </a>
                      </td>
                      <td className='p-2'>
                        {record.invoice_weight_mt as number}
                      </td>
                      <td className='p-2'>
                        {record.bill_from_company as string}
                      </td>
                      <td className='p-2'>
                        <span className='text-red-600 font-medium'>
                          {(record.flag_reasons as string[]).join(', ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.flaggedRecords.length > 10 && (
                <p className='text-sm text-slate-600 mt-2 text-center'>
                  Showing 10 of {metrics.flaggedRecords.length} records.
                  Download CSV for full data.
                </p>
              )}
            </div>
          ) : (
            <p className='text-green-600 font-medium'>
              ✅ No flagged records - all documents are compliant!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Recyclers */}
      <Card>
        <CardHeader>
          <CardTitle>🏆 Top Recyclers by Weight</CardTitle>
          <CardDescription>Leadership table for top performers</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.topRecyclers.length > 0 ? (
            <div className='space-y-2'>
              {metrics.topRecyclers.map((recycler, idx) => (
                <div
                  key={idx}
                  className='flex items-center justify-between p-3 bg-slate-50 rounded hover:bg-slate-100'
                >
                  <div className='flex items-center gap-3'>
                    <span className='text-lg font-bold text-slate-400'>
                      #{idx + 1}
                    </span>
                    <span className='font-medium'>{recycler.company}</span>
                  </div>
                  <div className='flex items-center gap-4'>
                    <span className='text-sm text-slate-600'>
                      {recycler.total_mt.toLocaleString()} MT
                    </span>
                    <span className='text-sm text-green-600 font-medium'>
                      {recycler.compliant_pct}% compliant
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-slate-600'>No recycler data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Plastic Type Distribution */}
      {metrics.plasticTypeDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Plastic Type Distribution</CardTitle>
            <CardDescription>Total weight by plastic type (MT)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={metrics.plasticTypeDistribution}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='plastic_type' />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey='total_mt'
                  fill='#3b82f6'
                  name='Total Weight (MT)'
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Flag Reason Breakdown */}
      {metrics.flagReasonBreakdown.length > 0 && (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Pie Chart - Flag Reasons by Count */}
          <Card>
            <CardHeader>
              <CardTitle>🚩 Flag Reasons Breakdown</CardTitle>
              <CardDescription>Distribution by count</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={300}>
                <PieChart>
                  <Pie
                    data={metrics.flagReasonBreakdown}
                    dataKey='count'
                    nameKey='reason'
                    cx='50%'
                    cy='50%'
                    outerRadius={100}
                    label={(props: PieLabelRenderProps) => {
                      const entry =
                        metrics.flagReasonBreakdown[props.index || 0];
                      return `${entry.reason}: ${entry.count}`;
                    }}
                  >
                    {metrics.flagReasonBreakdown.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          ['#ef4444', '#f97316', '#eab308', '#84cc16'][
                            index % 4
                          ]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bar Chart - Flag Reasons by Weight */}
          <Card>
            <CardHeader>
              <CardTitle>⚖️ Total Weight by Flag Reason</CardTitle>
              <CardDescription>Weight (MT) per flag type</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={300}>
                <BarChart data={metrics.flagReasonBreakdown} layout='vertical'>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis type='number' />
                  <YAxis dataKey='reason' type='category' width={150} />
                  <Tooltip />
                  <Bar dataKey='total_mt' fill='#ef4444' name='Weight (MT)' />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Time Trends Chart */}
      {metrics.monthlyTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📅 Time Trends: Matched vs Flagged</CardTitle>
            <CardDescription>
              Monthly weight comparison (stacked)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={400}>
              <BarChart data={metrics.monthlyTrends}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='month' />
                <YAxis
                  label={{
                    value: 'Weight (MT)',
                    angle: -90,
                    position: 'insideLeft',
                  }}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey='matched_mt'
                  stackId='a'
                  fill='#22c55e'
                  name='Matched Weight (MT)'
                />
                <Bar
                  dataKey='flagged_mt'
                  stackId='a'
                  fill='#ef4444'
                  name='Flagged Weight (MT)'
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
