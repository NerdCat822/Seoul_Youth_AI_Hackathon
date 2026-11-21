export function afterLogin() {
  const next = new URLSearchParams(location.search).get('next') ?? '';
  const valid =
    /^(?:home|home-guest|ai|explore|idea|records|calendar|record|record-edit|upload|confirm|result|forecast|baseline|store|settings)\.html(?:\?[^#]*)?$/;
  return valid.test(next) ? next : 'home.html';
}

export function loginForPage(next = location.pathname.split('/').pop()! + location.search) {
  return 'login.html?' + new URLSearchParams({ next }).toString();
}
