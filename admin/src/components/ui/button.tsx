import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import * as m from "motion/react-m"
import { Spinner } from "./spinner"
import { cn } from "@/lib/utils"
import { press } from "@/lib/motion"
import { Slot } from "radix-ui"

// Buttons carry no shadow at rest. Press feedback comes from the motion library
// (scale 0.98 over 120 ms, reduced motion honoured by the app's MotionConfig),
// so there are deliberately no transition or animation utility classes here.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-center text-base font-semibold whitespace-normal outline-hidden focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one accent on a screen: gold with navy text (6.7:1). Navy stays the structure colour (headings, header, selection); gold is the 10% you find at a squint.
        default: "bg-gold text-navy hover:bg-gold-press active:bg-gold-press",
        // Kept as an alias of default so existing call sites keep compiling; new code uses default.
        navy: "bg-gold text-navy hover:bg-gold-press active:bg-gold-press",
        outline:
          "border border-line bg-surface text-navy hover:bg-paper active:bg-paper",
        secondary: "border border-line bg-paper text-navy hover:bg-line/40",
        ghost: "text-navy hover:bg-paper active:bg-paper",
        destructive: "bg-danger text-white hover:bg-danger/90 active:bg-danger/90",
        link: "text-navy underline underline-offset-4 hover:text-navy-deep",
      },
      size: {
        default: "min-h-[52px] px-5 py-3 has-[>svg]:px-4",
        xs: "min-h-[44px] gap-1 px-3 py-1.5 text-sm has-[>svg]:px-2.5 lg:min-h-8 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-[44px] gap-1.5 px-4 py-2 has-[>svg]:px-3 lg:min-h-10",
        lg: "min-h-[52px] px-6 py-3 has-[>svg]:px-5",
        icon: "size-11 lg:size-10",
        "icon-xs": "size-11 lg:size-8 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-11 lg:size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** A request is in flight: shows a spinner before the label, disables the button and marks it busy. */
    loading?: boolean
  }) {
  const classes = cn(buttonVariants({ variant, size, className }))

  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={classes}
        {...props}
      />
    )
  }

  return (
    <m.button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes}
      whileTap={props.disabled || loading ? undefined : { transform: press.transform }}
      transition={press.transition}
      {...(props as React.ComponentProps<typeof m.button>)}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner />}
      {props.children}
    </m.button>
  )
}

export { Button, buttonVariants }
