type SortValue = "createdAt" | "totalBets" | "participantCount";

interface SortDropdownProps {
  value: SortValue;
  onChange: (value: SortValue) => void;
}

const options: { value: SortValue; label: string }[] = [
  { value: "createdAt", label: "Newest First" },
  { value: "totalBets", label: "Most Bets" },
  { value: "participantCount", label: "Most Participants" },
];

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortValue)}
      className="px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
