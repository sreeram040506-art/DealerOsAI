import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export const useFormField = () => {
  const { formState, getFieldState, register } = useFormContext();
  const fieldState = getFieldState(formState);

  return {
    id: fieldState.name,
    name: fieldState.name,
    formItemId: `${fieldState.name}-form-item`,
    formDescriptionId: `${fieldState.name}-form-item-description`,
    formMessageId: `${fieldState.name}-form-item-message`,
    ...fieldState,
  };
};