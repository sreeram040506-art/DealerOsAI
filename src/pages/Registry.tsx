import { useState, useMemo, useRef } from 'react';
import { formatSafeDate } from '@/lib/dateUtils';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { FileArchive, Download, Search, FileText, Pencil, Trash2, Eye, Filter, Receipt, ShoppingCart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRegistry, DocumentLog } from '@/hooks/useRegistry';
import { useQueryClient } from '@tanstack/react-query';
import EditRegistryDialog from '@/components/EditRegistryDialog';
import DocumentViewerDialog from '@/components/DocumentViewerDialog';

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

const DOCUMENT_TYPES = ['All', 'Used Vehicle Record', 'Title', 'Sales Agreement', 'Bill of Sale', 'Repair Invoice', 'Inspection', 'Other'];

export default function Registry() {
  const { token } = useAuth();
  const { logs, isLoading, isError, deleteLog } = useRegistry();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [selectedLog, setSelectedLog] = useState<DocumentLog | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const searchStr = `${log.vin} ${log.make} ${log.model} ${log.year} ${log.sourceFileName}`.toLowerCase();
      const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'All' || log.documentType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [logs, searchTerm, typeFilter]);

  if (isError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
           <FileArchive className="h-12 w-12 text-foreground/50" />
           <h2 className="text-xl font-bold text-foreground">Could not load registry</h2>
           <p className="text-muted-foreground max-w-xs">There was an error fetching the document logs.</p>
           <Button onClick={() => window.location.reload()} variant="outline" className="border-border text-muted-foreground">Retry</Button>
        </div>
      </AppLayout>
    );
  }

  const handleDownload = (id: string, customName: string, type: 'report' | 'source' | 'sale' = 'report') => {
    if (!token) return;
    let typeParam = '';
    if (type === 'source') typeParam = '&type=source';
    else if (type === 'sale') typeParam = '&type=sale';
    
    const downloadUrl = apiUrl(`/registry/${id}/download?token=${encodeURIComponent(token)}${typeParam}`);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 60000);
    toast.success(`Downloading ${customName}...`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log entry?')) return;
    try {
      await deleteLog(id);
      toast.success('Log entry deleted.');
    } catch (err) {
      toast.error('Failed to delete log entry.');
    }
  };

  const handleEdit = (log: DocumentLog) => {
    setSelectedLog(log);
    setEditDialogOpen(true);
  };

  const handleView = async (log: DocumentLog, type: 'report' | 'source' | 'sale' = 'report') => {
    if (!token) return;
    try {
      const resp = await fetch(apiUrl(`/registry/${log.id}/data`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch document data');
      const data = await resp.json();
      
      let base64 = '';
      let label = '';
      
      if (type === 'report') {
        base64 = data.documentBase64;
        label = log.documentType || 'Used Vehicle Record';
      } else if (type === 'source') {
        base64 = data.sourceDocumentBase64;
        label = 'Original Source';
      } else if (type === 'sale') {
        base64 = data.billOfSaleBase64;
        label = 'Bill of Sale';
      }
      
      if (base64) {
        let vehicleName = [log.year, log.make, log.model].filter(Boolean).join(' ') || 'Document';
        setViewerDoc({ base64, name: vehicleName, type: label });
        setViewerOpen(true);
      } else {
        toast.error(`No ${label.toLowerCase()} available to preview.`);
      }
    } catch (e) {
      toast.error('Error loading document preview.');
    }
  };

  const handleRmvUpload = async (file?: File | null) => {
    if (!token || !file) return;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.includes('base64,') ? result.split('base64,')[1] : result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const formData = new FormData();
      formData.append('sourceFile', file);
      formData.append('documentBase64', base64);

      const response = await fetch(apiUrl('/documents/generate-used-vehicle-form'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Upload failed');

      await queryClient.invalidateQueries({ queryKey: ['registry'] });
      toast.success(`RMV document uploaded: ${file.name}`, {
        description: data?.info?.vin ? `VIN: ${data.info.vin}` : 'VIN not extracted',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload RMV document');
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-foreground">
              <FileArchive className="h-8 w-8 text-primary" />
              Document Registry
            </h1>
            <p className="mt-2 text-muted-foreground">
              A permanent historical log of all generated and scanned documents.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="border-border"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload RMV Document'}
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(e) => handleRmvUpload(e.target.files?.[0])}
            />
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search VIN, Make, Model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-border bg-muted/50 pl-10 text-foreground focus-visible:ring-primary/50"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px] bg-muted/50 border-border h-10 text-xs">
                <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent className="bg-muted border-border text-foreground">
                {DOCUMENT_TYPES.map(dt => (
                  <SelectItem key={dt} value={dt}>{dt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-muted-foreground">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">Date Generated</th>
                  <th className="px-6 py-4 font-medium">Vehicle</th>
                  <th className="px-6 py-4 font-medium">Document Type</th>
                  <th className="px-6 py-4 font-medium">Source File</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">Loading logs...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      {searchTerm || typeFilter !== 'All' ? 'No matching documents found.' : 'Your registry is empty. Generate a document to start logging.'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const vehicleName = [log.year, log.make, log.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
                    const downloadName = `auto-profit-hub-${log.vin ? log.vin.slice(-6) : log.id.slice(-6)}-${log.documentType.replace(/\s+/g, '-')}`;
                    
                    return (
                      <tr key={log.id} className="transition-colors hover:bg-muted/30">
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-foreground">
                          {formatSafeDate(log.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{vehicleName}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{log.vin || 'No VIN Extracted'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
                            <FileText className="h-3.5 w-3.5" />
                            {log.documentType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground truncate max-w-[200px]">
                          {log.sourceFileName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 text-muted-foreground">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary/60 hover:bg-primary/10 hover:text-primary"
                                  title="View Document"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-white border-border min-w-[160px]">
                                <DropdownMenuItem 
                                  className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50 focus:bg-muted/50"
                                  onClick={() => handleView(log, 'report')}
                                >
                                  <FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50 focus:bg-muted/50"
                                  onClick={() => handleView(log, 'source')}
                                >
                                  <Receipt className="w-3.5 h-3.5 mr-2" /> Original Source
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-[10px] font-black uppercase py-2 cursor-pointer hover:bg-muted/50 focus:bg-muted/50"
                                  onClick={() => handleView(log, 'sale')}
                                >
                                  <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-muted/50 hover:text-foreground"
                              onClick={() => handleEdit(log)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-red-500/10 hover:text-red-500"
                              onClick={() => handleDelete(log.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary hover:bg-primary/10 hover:text-primary h-8 border border-primary/20 rounded-lg ml-1"
                                >
                                  <Download className="mr-2 h-3.5 w-3.5" /> Download
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-muted border-border text-foreground">
                                <DropdownMenuItem 
                                  className="hover:bg-muted/50 focus:bg-muted/50 cursor-pointer"
                                  onClick={() => handleDownload(log.id, downloadName)}
                                >
                                  Generated PDF Record
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="hover:bg-muted/50 focus:bg-muted/50 cursor-pointer"
                                  onClick={() => handleDownload(log.id, downloadName, 'source')}
                                >
                                  Original Source File
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="hover:bg-muted/50 focus:bg-muted/50 cursor-pointer text-foreground"
                                  onClick={() => handleDownload(log.id, downloadName, 'sale')}
                                >
                                  Bill of Sale Document
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <EditRegistryDialog 
          log={selectedLog} 
          open={editDialogOpen} 
          onOpenChange={setEditDialogOpen} 
        />
        
        <DocumentViewerDialog
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          documentBase64={viewerDoc?.base64 || null}
          vehicleName={viewerDoc?.name || ''}
          documentType={viewerDoc?.type || ''}
        />
      </div>
    </AppLayout>
  );
}
