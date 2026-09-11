import React from 'react';
import { Redirect } from 'expo-router';

export default function StatsRedirect() {
  return <Redirect href={'/wrapped' as any} />;
}
