import type { XmlProps } from "react-native-svg";
import type { ColorTokens } from "tamagui";

import { SvgXml } from "react-native-svg";

import { svgImports } from "./svg-imports";
import { sizes } from "@theme";
import { getImageDimensions } from "@anicca-labs/react-native-functions";
import { useFontScale } from "@anicca-labs/react-native-hooks";
import { useColorTokenValue } from "@anicca-labs/react-native-ui-config";

type IconName = keyof typeof svgImports;

type BaseIconProps = {
  iconName: IconName;
  color?: ColorTokens;
  width?: number;
  height?: number;
  autoScaleBasedOnScreenDimensions?: boolean;
  maxFontScaleToApply?: number;
  viewBox?: string;
} & Omit<XmlProps, "width" | "height" | "color" | "xml">;

const isIconValid = (nameOfIcon: string | IconName): nameOfIcon is IconName =>
  nameOfIcon in svgImports;

const BaseIcon = ({
  color,
  iconName,
  width,
  height,
  preserveAspectRatio = "xMaxYMax meet",
  autoScaleBasedOnScreenDimensions = true,
  maxFontScaleToApply,
  viewBox = "0 0 24 24",
  ...rest
}: BaseIconProps) => {
  if (!isIconValid(iconName)) {
    throw new Error(`Icon ${iconName} does not exist`);
  }

  const fontScale = useFontScale();

  const { width: maybeScaledWidth, height: maybeScaledHeight } =
    getImageDimensions({
      width,
      height,
      autoScaleBasedOnScreenDimensions,
      defaultSize: sizes.lg,
      fontScale,
      maxFontScaleToApply,
    });

  const calculatedColor = useColorTokenValue(color);
  const svgXml = svgImports[iconName];

  return (
    <SvgXml
      width={maybeScaledWidth}
      height={maybeScaledHeight}
      color={calculatedColor}
      xml={svgXml}
      preserveAspectRatio={preserveAspectRatio}
      {...rest}
    />
  );
};

export { BaseIcon };
export type { IconName, BaseIconProps };
