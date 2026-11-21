import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The app's own type roles (globals.css) are font sizes. Stock tailwind-merge reads an unknown `text-*` as a
// colour, so `text-body text-white` lost the size. Telling it the roles keeps both.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "display-xl", "amount", "title", "heading", "body", "note", "label"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
