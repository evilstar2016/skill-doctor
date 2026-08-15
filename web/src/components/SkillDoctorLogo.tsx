import markUrl from '../../../assets/brand/skill-doctor-mark.svg';

type SkillDoctorLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
};

export function SkillDoctorLogo({ size = 34, className, alt = 'Skill Doctor logo' }: SkillDoctorLogoProps) {
  return (
    <img
      className={className ? `skill-doctor-logo ${className}` : 'skill-doctor-logo'}
      src={markUrl}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      width={size}
      height={size}
    />
  );
}
