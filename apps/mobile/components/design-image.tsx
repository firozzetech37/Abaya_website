import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from './text';

interface Props {
  uri: string | null | undefined;
  name: string;
  alt?: string | null;
  className?: string;
  /** Size of the fallback initial. */
  initialSize?: 'sm' | 'lg';
}

/**
 * Design photo with a calm placeholder: a warm neutral tile with the design's
 * initial, used while loading, when there is no image, or when it fails.
 */
export function DesignImage({ uri, name, alt, className = '', initialSize = 'lg' }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  return (
    <View className={`overflow-hidden bg-sand-100 ${className}`}>
      <View className="absolute inset-0 items-center justify-center" importantForAccessibility="no-hide-descendants">
        <Text
          className={`font-display text-gold-300 ${initialSize === 'lg' ? 'text-5xl' : 'text-2xl'}`}
        >
          {name.trim().charAt(0).toUpperCase()}
        </Text>
      </View>
      {showImage ? (
        <Image
          source={{ uri: uri ?? undefined }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={200}
          accessibilityLabel={alt ?? name}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}
