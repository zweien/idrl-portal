import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[rgb(var(--ring-rgb)/0.5)] focus-visible:ring-[3px] aria-invalid:ring-[rgb(var(--destructive-rgb)/0.2)] dark:aria-invalid:ring-[rgb(var(--destructive-rgb)/0.4)] aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-[rgb(var(--destructive-rgb)/0.9)] focus-visible:ring-[rgb(var(--destructive-rgb)/0.2)] dark:focus-visible:ring-[rgb(var(--destructive-rgb)/0.4)]',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-[rgb(var(--input-rgb)/0.3)] dark:border-input dark:hover:bg-[rgb(var(--input-rgb)/0.5)]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[rgb(var(--secondary-rgb)/0.8)]',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-[rgb(var(--accent-rgb)/0.5)]',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
