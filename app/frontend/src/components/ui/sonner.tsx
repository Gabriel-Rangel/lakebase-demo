import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      richColors
      closeButton
      duration={6000}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-sm",
          actionButton: "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
