import { AlertTriangle } from 'lucide-react';

interface QueryErrorStateProps {
  title: string;
  description: string;
}

export default function QueryErrorState({ title, description }: QueryErrorStateProps) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-foreground">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground font-medium">{description}</p>
        </div>
      </div>
    </div>
  );
}
