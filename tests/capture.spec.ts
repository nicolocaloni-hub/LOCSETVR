import { expect, test, type Page } from '@playwright/test';
import type { DigitalCloneRecord } from '../types';

type SensorSample = { alpha: number; beta: number; gamma: number };
type CaptureTestWindow = Window & {
  __captureTestSensor?: SensorSample;
  __captureTestDispatch?: () => void;
  __captureTestDark?: boolean;
};

async function installCaptureDevices(page: Page, denied = false) {
  await page.addInitScript(({ denied }) => {
    const testWindow = window as CaptureTestWindow;
    testWindow.__captureTestSensor = { alpha: 123, beta: 90, gamma: 0 };
    const dispatch = () => {
      if (!denied && testWindow.__captureTestSensor) {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', testWindow.__captureTestSensor));
      }
    };
    testWindow.__captureTestDispatch = dispatch;
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => denied ? 'denied' : 'granted',
    });
    window.setInterval(dispatch, 80);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext('2d')!;
        const paint = () => {
          if (testWindow.__captureTestDark) {
            context.fillStyle = '#000000';
            context.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            for (let y = 0; y < canvas.height; y += 20) {
              for (let x = 0; x < canvas.width; x += 20) {
                context.fillStyle = (x / 20 + y / 20) % 2 ? '#34545c' : '#dab982';
                context.fillRect(x, y, 20, 20);
              }
            }
            context.strokeStyle = '#ffffff';
            context.lineWidth = 8;
            context.strokeRect(120, 85, 380, 290);
          }
        };
        paint();
        const timer = window.setInterval(paint, 80);
        const stream = canvas.captureStream(12);
        stream.getTracks().forEach((track) => {
          const stop = track.stop.bind(track);
          track.stop = () => { window.clearInterval(timer); stop(); };
        });
        return stream;
      },
    });
  }, { denied });
}

async function pointPhone(page: Page, alpha: number, beta = 90, gamma = 0) {
  await page.evaluate(({ alpha, beta, gamma }) => {
    const testWindow = window as CaptureTestWindow;
    testWindow.__captureTestSensor = { alpha, beta, gamma };
    testWindow.__captureTestDispatch?.();
  }, { alpha, beta, gamma });
}

function previewCount(page: Page) {
  return page.getByRole('region', { name: 'Aree acquisite' }).locator('.capture-world-heading strong');
}

async function takePhoto(page: Page, count: number) {
  const shutter = page.locator('button.shutter');
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await expect(previewCount(page)).toHaveText(new RegExp(`^${count}\\s*/\\s*16$`));
}

test('the accepted front photo anchors rotation, then saves all three surface bands', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installCaptureDevices(page);
  await page.goto('/#/capture');
  await page.getByRole('button', { name: /Inizia dalla foto frontale/ }).click();
  const firstShutter = page.getByRole('button', { name: 'Scatta foto frontale', exact: true });

  // Pointing at the floor cannot establish a valid front reference.
  await pointPhone(page, 123, 0);
  await expect(firstShutter).toBeDisabled();
  await pointPhone(page, 123, 90);
  await expect(firstShutter).toBeEnabled();

  // Changing direction before the first accepted shutter must not preserve
  // the initial sensor event as the front of the room.
  await pointPhone(page, 210, 90);
  await takePhoto(page, 1);
  await expect(page.getByRole('region', { name: 'Aree acquisite' }).locator('canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('first-photo-coverage.png') });
  await expect(page.getByRole('button', { name: 'Scatta foto', exact: true })).toBeDisabled();
  await pointPhone(page, 165, 90);
  await takePhoto(page, 2);

  for (let wallIndex = 2; wallIndex < 8; wallIndex += 1) {
    await pointPhone(page, (210 - wallIndex * 45 + 360) % 360, 90);
    await takePhoto(page, wallIndex + 1);
  }

  // A wall-facing phone must be rejected when the next assignment is floor.
  await pointPhone(page, 165, 90);
  await expect(page.getByRole('button', { name: 'Scatta foto', exact: true })).toBeDisabled();
  for (let floorIndex = 0; floorIndex < 4; floorIndex += 1) {
    await pointPhone(page, (210 - (45 + floorIndex * 90) + 360) % 360, 32);
    await takePhoto(page, 9 + floorIndex);
  }
  for (let ceilingIndex = 0; ceilingIndex < 4; ceilingIndex += 1) {
    await pointPhone(page, (210 - (45 + ceilingIndex * 90) + 360) % 360, 148);
    await takePhoto(page, 13 + ceilingIndex);
  }

  await page.getByRole('textbox', { name: 'Nome location' }).fill('Stanza E2E — riferimento frontale');
  await page.getByRole('button', { name: 'Apri lo spazio', exact: true }).click();
  await expect(page).toHaveURL(/#\/viewer\/.+/, { timeout: 30000 });
  await expect(page.locator('.viewer-canvas canvas')).toBeVisible();
  await expect(page.locator('.viewer-loading')).toBeHidden({ timeout: 30000 });

  const saved = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('LOCSETVR_DB', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ name: string; images: number; panels: DigitalCloneRecord['reconstruction']['panels'] }>((resolve, reject) => {
        const request = database.transaction('models', 'readonly').objectStore('models').getAll();
        request.onsuccess = () => {
          const record = (request.result as DigitalCloneRecord[]).find((item) => item.name === 'Stanza E2E — riferimento frontale');
          if (!record) return reject(new Error('Captured location was not saved'));
          resolve({ name: record.name, images: record.images.length, panels: record.reconstruction.panels });
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
  expect(saved.images).toBe(16);
  expect(saved.panels.filter((panel) => panel.role === 'wall')).toHaveLength(8);
  expect(saved.panels.filter((panel) => panel.role === 'floor')).toHaveLength(4);
  expect(saved.panels.filter((panel) => panel.role === 'ceiling')).toHaveLength(4);
  expect(saved.panels[0].pose?.source).toBe('sensor');
  expect(saved.panels[0].pose?.yaw).toBeCloseTo(0, 0);
  expect(saved.panels[0].pose?.pitch).toBeCloseTo(0, 0);
  expect(saved.panels.filter((panel) => panel.role === 'floor').every((panel) => (panel.pose?.pitch ?? 1) < -40)).toBe(true);
  expect(saved.panels.filter((panel) => panel.role === 'ceiling').every((panel) => (panel.pose?.pitch ?? -1) > 40)).toBe(true);
  await page.reload();
  await expect(page.locator('.viewer-canvas canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('denied sensors require an explicit manual choice and still show accepted photos', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installCaptureDevices(page, true);
  await page.goto('/#/capture');
  await page.getByRole('button', { name: /Inizia dalla foto frontale/ }).click();
  await expect(page.getByRole('button', { name: 'Scatta foto frontale', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Continua con guida manuale', exact: true }).click();
  await takePhoto(page, 1);
  await expect(page.getByText(/manuale/i).first()).toBeVisible();
  await expect(page.locator('input[type="file"]')).not.toHaveAttribute('multiple');
  expect(errors).toEqual([]);
});

test('retaking the first photo preserves the reference and rejected dark photos add no patch', async ({ page }) => {
  await installCaptureDevices(page);
  await page.goto('/#/capture');
  await page.getByRole('button', { name: /Inizia dalla foto frontale/ }).click();
  await pointPhone(page, 120, 90);
  await takePhoto(page, 1);
  await page.getByRole('button', { name: /Riprendi foto 1:/ }).click();
  await expect(previewCount(page)).toHaveText(/^0\s*\/\s*16$/);
  await pointPhone(page, 300, 90);
  await expect(page.locator('button.shutter')).toBeDisabled();
  await pointPhone(page, 120, 90);
  await takePhoto(page, 1);
  await pointPhone(page, 75, 90);
  const shutter = page.getByRole('button', { name: 'Scatta foto', exact: true });
  await expect(shutter).toBeEnabled();
  await page.evaluate(() => { (window as CaptureTestWindow).__captureTestDark = true; });
  // Wait for the controlled camera stream to deliver its next painted frame.
  await page.waitForTimeout(200);
  await shutter.click();
  await expect(page.getByText('Inquadratura troppo scura', { exact: true })).toBeVisible();
  await expect(previewCount(page)).toHaveText(/^1\s*\/\s*16$/);
});
