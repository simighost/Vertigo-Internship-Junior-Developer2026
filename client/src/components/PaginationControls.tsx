import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  page,
  totalPages,
  hasNextPage,
  totalCount,
  itemsPerPage,
  onPageChange,
}: PaginationControlsProps) {
  const start = totalCount === 0 ? 0 : (page - 1) * itemsPerPage + 1;
  const end = Math.min(page * itemsPerPage, totalCount);

  return (
    <div className="flex justify-between items-center mt-8">
      <span className="text-sm text-muted-foreground">
        {totalCount === 0
          ? "No markets found"
          : `Showing ${start}–${end} of ${totalCount} markets`}
      </span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Previous
        </Button>
        <span className="text-sm font-medium">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNextPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
