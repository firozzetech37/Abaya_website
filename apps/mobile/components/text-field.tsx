import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { Text } from './text';
import { colors, fonts } from '../lib/theme';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  suffix?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, suffix, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-danger' : focused ? 'border-gold-400' : 'border-border';
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <View
        className={`min-h-[54px] flex-row items-center rounded-2xl border bg-surface px-4 ${border}`}
        style={focused && !error ? { shadowColor: '#CCA24A', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 2 } : undefined}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.neutral['400']}
          className="flex-1 py-3 text-base text-foreground"
          style={{ fontFamily: fonts.sans }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {suffix ? <Text className="ml-2 text-base text-muted">{suffix}</Text> : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
});
