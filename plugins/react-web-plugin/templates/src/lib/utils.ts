import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Conditional Tailwind classes — always through cn(), never template-string
// concatenation (which breaks tailwind-merge deduping).
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export { cn };
