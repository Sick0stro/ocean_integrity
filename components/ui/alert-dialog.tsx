'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

interface AlertDialogContentProps {
  className?: string;
  children: React.ReactNode;
}

interface AlertDialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

interface AlertDialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

interface AlertDialogTitleProps {
  className?: string;
  children: React.ReactNode;
}

interface AlertDialogDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

interface AlertDialogActionProps {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

interface AlertDialogCancelProps {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

const AlertDialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({
  open: false,
  onOpenChange: () => {},
});

const AlertDialog = ({
  open = false,
  onOpenChange,
  children,
}: AlertDialogProps) => {
  return (
    <AlertDialogContext.Provider
      value={{ open, onOpenChange: onOpenChange || (() => {}) }}
    >
      {children}
      {open && (
        <div className='fixed inset-0 z-50 bg-background/80 backdrop-blur-sm'>
          <div className='fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]'>
            {children}
          </div>
        </div>
      )}
    </AlertDialogContext.Provider>
  );
};

const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  AlertDialogContentProps
>(({ className, children, ...props }, ref) => {
  const { open } = React.useContext(AlertDialogContext);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = ({ className, children }: AlertDialogHeaderProps) => (
  <div
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      className
    )}
  >
    {children}
  </div>
);

const AlertDialogFooter = ({ className, children }: AlertDialogFooterProps) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
  >
    {children}
  </div>
);

const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  AlertDialogTitleProps
>(({ className, children, ...props }, ref) => (
  <h2 ref={ref} className={cn('text-lg font-semibold', className)} {...props}>
    {children}
  </h2>
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  AlertDialogDescriptionProps
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  >
    {children}
  </p>
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  AlertDialogActionProps
>(({ className, onClick, children, ...props }, ref) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);

  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      onClick={() => {
        onClick?.();
        onOpenChange(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
AlertDialogAction.displayName = 'AlertDialogAction';

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  AlertDialogCancelProps
>(({ className, onClick, children, ...props }, ref) => {
  const { onOpenChange } = React.useContext(AlertDialogContext);

  return (
    <button
      ref={ref}
      className={cn(
        'mt-2 inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:mt-0',
        className
      )}
      onClick={() => {
        onClick?.();
        onOpenChange(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
export type {
  AlertDialogProps,
  AlertDialogContentProps,
  AlertDialogHeaderProps,
  AlertDialogFooterProps,
  AlertDialogTitleProps,
  AlertDialogDescriptionProps,
  AlertDialogActionProps,
  AlertDialogCancelProps,
};
