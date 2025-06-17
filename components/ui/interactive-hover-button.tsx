"use client";

import React from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";

interface InteractiveHoverButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  children: React.ReactNode;
  className?: string;
  isLoading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  loadingText?: string;
  successText?: string;
  errorText?: string;
}

export const InteractiveHoverButton = React.forwardRef<HTMLButtonElement, InteractiveHoverButtonProps>(
  (
    {
      children,
      className,
      onClick,
      isLoading = false,
      isSuccess = false,
      isError = false,
      loadingText = "Loading...",
      successText = "Success!",
      errorText = "Error!",
      ...props
    },
    ref,
  ) => {
    // Button state
    let buttonState: "default" | "loading" | "success" | "error" = "default";
    if (isLoading) buttonState = "loading";
    else if (isError) buttonState = "error";
    else if (isSuccess) buttonState = "success";

    // Content for each state
    const getButtonContent = () => {
      if (buttonState === "loading")
        return (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{loadingText}</span>
          </div>
        );
      if (buttonState === "success")
        return (
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span>{successText}</span>
          </div>
        );
      if (buttonState === "error")
        return (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{errorText}</span>
          </div>
        );
      // Default state
      return <div className="flex items-center gap-2">{children}</div>;
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          "relative w-auto cursor-pointer overflow-hidden rounded-full border bg-background p-2 px-6 text-center font-semibold transition-all duration-300",
          buttonState === "success"
            ? "border-green-500 bg-green-500 text-white shadow-lg scale-105"
            : buttonState === "error"
            ? "border-red-500 bg-red-500 text-white shadow-lg"
            : buttonState === "loading"
            ? "border-blue-400 bg-blue-500 text-white shadow-lg cursor-not-allowed"
            : "border-gray-300 text-gray-700 shadow-sm hover:border-blue-500 hover:bg-blue-500 hover:text-white",
          className,
        )}
        onClick={onClick}
        disabled={isLoading}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: buttonState === "success" ? 1.05 : 1 }}
        transition={{ duration: 0.2 }}
        {...props}
      >
        {getButtonContent()}
      </motion.button>
    );
  },
);

InteractiveHoverButton.displayName = "InteractiveHoverButton";
