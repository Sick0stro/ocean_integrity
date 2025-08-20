'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CheckCircle, Scale } from 'lucide-react';

interface DashboardStatsProps {
  totalTons: number;
  processedCount: number;
  verifiedCount: number;
  loading: boolean;
}

export function DashboardStats({ totalTons, processedCount, verifiedCount, loading }: DashboardStatsProps) {
  if (loading) {
    return (
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="w-48 animate-pulse">
            <CardContent className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <Card className="w-48">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Tons
          </CardTitle>
          <Scale className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTons.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">
            From verified documents
          </p>
        </CardContent>
      </Card>

      <Card className="w-48">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Processed Docs
          </CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{processedCount}</div>
        </CardContent>
      </Card>

      <Card className="w-48">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Verified Docs
          </CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{verifiedCount}</div>
          {processedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {Math.round((verifiedCount / processedCount) * 100)}% of total
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
