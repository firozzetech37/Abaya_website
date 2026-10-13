import type { DesignDetail, MeasurementProfileDto, OptionGroupCode } from '@abaya/contracts';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback } from 'react';
import { View } from 'react-native';
import { Text } from './text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { strings } from '../content/strings';
import type { RedesignSelection } from '../lib/redesign';
import { colors } from '../lib/theme';
import { OptionGroupSection } from './option-chips';
import { PriceBar } from './price-bar';
import { SizePicker } from './size-picker';

export interface RedesignSheetProps {
  design: DesignDetail;
  selection: RedesignSelection;
  sizeMode: 'BAND' | 'MEASUREMENTS';
  onSizeModeChange: (m: 'BAND' | 'MEASUREMENTS') => void;
  onToggle: (groupCode: OptionGroupCode, valueId: string) => void;
  onSizeChange: (size: RedesignSelection['size']) => void;
  missing: OptionGroupCode[];
  showMissing: boolean;
  priceInPaise: number | null;
  confirmed: boolean;
  onAddToBag: () => void;
  adding: boolean;
  hint: string | null;
  profiles: MeasurementProfileDto[];
  signedIn: boolean;
  onAddMeasurements: () => void;
  onSignIn: () => void;
}

const SNAP_POINTS = ['92%'];

/** The Redesign panel as a native bottom sheet: option groups, size, sticky price + Add to bag. */
export const RedesignSheet = forwardRef<BottomSheetModal, RedesignSheetProps>(function RedesignSheet(props, ref) {
  const insets = useSafeAreaInsets();
  const { design, selection } = props;

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  const { priceInPaise, confirmed, onAddToBag, adding, hint } = props;
  const renderFooter = useCallback(
    (p: BottomSheetFooterProps) => (
      <BottomSheetFooter {...p} bottomInset={0}>
        <PriceBar
          priceInPaise={priceInPaise}
          confirmed={confirmed}
          actionLabel={adding ? strings.design.adding : strings.design.addToBag}
          onAction={onAddToBag}
          loading={adding}
          hint={hint}
        />
      </BottomSheetFooter>
    ),
    [priceInPaise, confirmed, onAddToBag, adding, hint],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      topInset={insets.top}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.neutral['300'], width: 40 }}
      accessibilityLabel={strings.design.redesign}
    >
      <View className="border-b border-border px-5 pb-3">
        <Text className="font-display text-3xl text-foreground">{strings.design.redesign}</Text>
        <Text className="text-sm text-muted">{design.name}</Text>
      </View>
      <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 + insets.bottom }}>
        {design.optionGroups.map((g) => (
          <View key={g.code} className="border-b border-border">
            <OptionGroupSection
              group={g}
              selected={selection.optionValueIds}
              onToggle={(id) => props.onToggle(g.code, id)}
              missing={props.showMissing && props.missing.includes(g.code)}
            />
          </View>
        ))}
        <SizePicker
          design={design}
          size={selection.size}
          mode={props.sizeMode}
          onModeChange={props.onSizeModeChange}
          onChange={props.onSizeChange}
          profiles={props.profiles}
          signedIn={props.signedIn}
          onAddMeasurements={props.onAddMeasurements}
          onSignIn={props.onSignIn}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
