"use client"

import { useState, useEffect } from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { XIcon, SearchIcon } from 'lucide-react';
import { LogsHeader, LogsTabs } from "@/components/logs-header";
import filingService from '@/services/filingService';
import { FilingLog } from '@/types/filing';

export default function LogsPage() {
  const [logs, setLogs] = useState<FilingLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilingType, setSelectedFilingType] = useState('all-types');
  const [selectedStatus, setSelectedStatus] = useState('all-statuses');
  const [isFilingDetailsOpen, setIsFilingDetailsOpen] = useState(false);
  const [selectedFiling, setSelectedFiling] = useState<FilingLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await filingService.getFilingLogs();
      setLogs(response.data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs([]);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.filingName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedFilingType === 'all-types' || log.filingCode.toLowerCase() === selectedFilingType.toLowerCase();
    const matchesStatus = selectedStatus === 'all-statuses' || log.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleRowClick = (filing: FilingLog) => {
    setSelectedFiling(filing);
    setIsFilingDetailsOpen(true);
  };

  const handleTabChange = (value: string) => {
    // Map tab values to filing codes
    if (value === 'all') {
      setSelectedFilingType('all-types');
    } else if (value === '10k') {
      setSelectedFilingType('10-k');
    } else if (value === '10q') {
      setSelectedFilingType('10-q');
    } else if (value === '8k') {
      setSelectedFilingType('8-k');
    }
  };

  return (
    <div className="container mx-auto py-8">
      <LogsHeader />
      
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="relative w-full md:w-64">
            <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ticker, company, or filing..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <LogsTabs defaultTab="all" onTabChange={handleTabChange} />
            
            <Select 
              value={selectedStatus}
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-statuses">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="[&_td]:border-l [&_td:first-child]:border-l-0 [&_th]:border-l [&_th:first-child]:border-l-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Filing Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((filing) => (
                    <TableRow 
                      key={filing.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(filing)}
                    >
                      <TableCell>{filing.ticker}</TableCell>
                      <TableCell>{filing.company}</TableCell>
                      <TableCell>{filing.filingName}</TableCell>
                      <TableCell>{filing.status}</TableCell>
                      <TableCell>{filing.filingDate}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      No logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4 text-right text-sm text-muted-foreground">
          Showing {filteredLogs.length} logs
        </div>
      </div>

      <Dialog open={isFilingDetailsOpen} onOpenChange={setIsFilingDetailsOpen}>
        <DialogContent className="max-w-2xl">
          {selectedFiling && (
            <>
              <DialogHeader className="text-left">
                <div className="flex justify-between items-start">
                  <div>
                    <DialogTitle className="text-xl">
                      {selectedFiling.ticker} ({selectedFiling.company}) - {selectedFiling.filingName} ({selectedFiling.filingCode})
                    </DialogTitle>
                    <DialogDescription>
                      Filed on {selectedFiling.filingDate}
                    </DialogDescription>
                  </div>
                  <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                    <XIcon className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogClose>
                </div>
              </DialogHeader>
              
              {selectedFiling.details && selectedFiling.details.revenue && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-4">Financial Highlights</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-md p-4">
                      <div className="text-sm text-muted-foreground">Revenue</div>
                      <div className="text-2xl font-bold">{selectedFiling.details.revenue}</div>
                      <div className="text-sm text-green-500">
                        {selectedFiling.details.yoy?.revenue} YoY
                      </div>
                    </div>
                    <div className="border rounded-md p-4">
                      <div className="text-sm text-muted-foreground">Operating Margin</div>
                      <div className="text-2xl font-bold">{selectedFiling.details.operatingMargin}</div>
                      <div className="text-sm text-green-500">
                        {selectedFiling.details.yoy?.margin} YoY
                      </div>
                    </div>
                    <div className="border rounded-md p-4">
                      <div className="text-sm text-muted-foreground">EPS</div>
                      <div className="text-2xl font-bold">{selectedFiling.details.eps}</div>
                      <div className="text-sm text-green-500">
                        {selectedFiling.details.yoy?.eps} YoY
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {selectedFiling.details && selectedFiling.details.keyInsights && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-2">Key Insights</h3>
                  <ul className="space-y-2">
                    {selectedFiling.details.keyInsights.map((insight, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {selectedFiling.details && selectedFiling.details.riskFactors && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-2">Risk Factors</h3>
                  <ul className="space-y-2">
                    {selectedFiling.details.riskFactors.map((risk, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-amber-500 mr-2">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
