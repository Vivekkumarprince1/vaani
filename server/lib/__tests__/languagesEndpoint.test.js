const translatorRouter = require('../../routes/translator');

describe('GET /translator/languages endpoint', () => {
  test('returns non-empty language catalog without requiring authentication', async () => {
    let responseData = null;
    const req = { header: () => null };
    const res = {
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    const route = translatorRouter.stack.find(s => s.route && s.route.path === '/languages');
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);

    expect(responseData).toBeDefined();
    expect(Object.keys(responseData).length).toBeGreaterThan(10);
    expect(responseData.en).toMatchObject({ name: 'English' });
    expect(responseData.hi).toMatchObject({ name: 'Hindi', nativeName: 'हिन्दी' });
    expect(responseData.es).toMatchObject({ name: 'Spanish', nativeName: 'Español' });
    expect(responseData.fr).toMatchObject({ name: 'French' });
  });

  test('contains Indian regional languages', async () => {
    let responseData = null;
    const req = { header: () => null };
    const res = {
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    const route = translatorRouter.stack.find(s => s.route && s.route.path === '/languages');
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);

    expect(responseData.bn).toBeDefined(); // Bengali
    expect(responseData.pa).toBeDefined(); // Punjabi
    expect(responseData.mr).toBeDefined(); // Marathi
    expect(responseData.gu).toBeDefined(); // Gujarati
    expect(responseData.ta).toBeDefined(); // Tamil
    expect(responseData.te).toBeDefined(); // Telugu
  });
});
