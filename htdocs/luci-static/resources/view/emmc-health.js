'use strict';
'require view';
'require fs';

return view.extend({
	load: function() {
		return this.fetchHealth();
	},

	fetchHealth: function() {
		return fs.exec('/usr/libexec/emmc-health', []).then(function(res) {
			var stdout = (res && res.stdout) ? res.stdout.trim() : '';

			try {
				return JSON.parse(stdout || '{}');
			}
			catch (e) {
				return {
					ok: false,
					error: 'invalid_json',
					message: _('后端返回的数据不是有效 JSON。'),
					raw_output: stdout
				};
			}
		}).catch(function(err) {
			return {
				ok: false,
				error: 'exec_failed',
				message: _('无法执行 /usr/libexec/emmc-health：') + (err && err.message ? err.message : err)
			};
		});
	},

	render: function(data) {
		var content = E('div', { 'class': 'emmc-render-slot' }, this.renderContent(data));
		var root = E('div', { 'class': 'emmc-health-page' }, [
			E('style', {}, this.styles()),
			E('div', { 'class': 'emmc-health-header' }, [
				E('div', { 'class': 'emmc-health-title-wrap' }, [
					E('h2', {}, _('eMMC 健康'))
				])
			]),
			content
		]);

		return root;
	},

	renderContent: function(data) {
		if (!data || data.ok !== true)
			return this.renderError(data || {});

		var levelClass = this.levelClass(data.health_level);

		return E('div', { 'class': 'emmc-health-content' }, [
			this.heroStatus(data, levelClass),

			E('div', { 'class': 'emmc-overview-grid' }, [
				this.infoCard(_('eMMC 设备'), data.device || _('未知'), _('自动扫描到的整盘设备')),
				this.infoCard(_('eMMC 标准'), data.mmc_version || _('未知'), _('EXT_CSD rev ') + (data.ext_csd_rev || _('未知'))),
				this.infoCard(_('eMMC 品牌'), data.manufacturer || _('未知'), _('型号：') + (data.model || _('未知')) + _(' / MID：') + (data.mid || _('未知'))),
				this.infoCard(_('eMMC \u5bb9\u91cf'), data.capacity || _('\u672a\u77e5'), _('\u7a7a\u95f4\u4f7f\u7528\uff1a') + (data.used || _('\u672a\u77e5')) + _(' / ') + (data.usable || _('\u672a\u77e5')))
			]),

			E('div', { 'class': 'emmc-panel' }, [
				E('div', { 'class': 'emmc-panel-title' }, _('寿命估算')),
				this.progressRow(_('Life Time A'), data.life_a_raw, data.life_a_range, data.life_a_percent),
				this.progressRow(_('Life Time B'), data.life_b_raw, data.life_b_range, data.life_b_percent)
			]),

			E('div', { 'class': 'emmc-eol-card ' + this.preEolClass(data.pre_eol_status) }, [
				E('div', {}, [
					E('div', { 'class': 'emmc-card-label' }, _('Pre EOL 状态')),
					E('div', { 'class': 'emmc-eol-status' }, data.pre_eol_status || _('未知'))
				]),
				E('div', { 'class': 'emmc-raw-badge' }, data.pre_eol_raw || _('未知'))
			])
		]);
	},

	heroStatus: function(data, cls) {
		return E('div', { 'class': 'emmc-hero-card ' + cls }, [
			E('div', { 'class': 'emmc-hero-main' }, [
				E('div', { 'class': 'emmc-card-label' }, _('eMMC 健康状态')),
				E('div', { 'class': 'emmc-hero-status' }, data.health_level || _('未知')),
				E('div', { 'class': 'emmc-hero-note' }, data.suggestion || '')
			]),
			E('div', { 'class': 'emmc-hero-facts' }, [
				E('div', {}, [
					E('span', {}, _('Life Time A')),
					E('strong', {}, data.life_a_range || _('未知'))
				]),
				E('div', {}, [
					E('span', {}, _('Life Time B')),
					E('strong', {}, data.life_b_range || _('未知'))
				]),
				E('div', {}, [
					E('span', {}, _('Pre EOL')),
					E('strong', {}, data.pre_eol_status || _('未知'))
				])
			])
		]);
	},

	renderError: function(data) {
		var message = data.message || _('读取 eMMC 健康信息失败。');

		return E('div', { 'class': 'emmc-health-content' }, [
			E('div', { 'class': 'emmc-alert' }, [
				E('div', { 'class': 'emmc-alert-title' }, _('无法显示 eMMC 健康')),
				E('div', {}, message)
			])
		]);
	},

	infoCard: function(label, value, note, cls) {
		return E('div', { 'class': 'emmc-card ' + (cls || '') }, [
			E('div', { 'class': 'emmc-card-label' }, label),
			E('div', { 'class': 'emmc-card-value' }, value),
			E('div', { 'class': 'emmc-card-note' }, note)
		]);
	},

	statusCard: function(label, value, note, cls) {
		return E('div', { 'class': 'emmc-card emmc-status-card ' + cls }, [
			E('div', { 'class': 'emmc-card-label' }, label),
			E('div', { 'class': 'emmc-card-value' }, value),
			E('div', { 'class': 'emmc-card-note' }, note)
		]);
	},

	progressRow: function(label, raw, range, percent) {
		var safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

		return E('div', { 'class': 'emmc-progress-row' }, [
			E('div', { 'class': 'emmc-progress-meta' }, [
				E('div', {}, [
					E('strong', {}, label),
					E('span', { 'class': 'emmc-raw-badge' }, raw || _('未知'))
				]),
				E('span', {}, range || _('未知'))
			]),
			E('div', { 'class': 'emmc-progress-track' }, [
				E('div', {
					'class': 'emmc-progress-fill ' + this.percentClass(safePercent),
					'style': 'width:' + safePercent + '%'
				})
			])
		]);
	},

	levelClass: function(level) {
		if (level === '危险')
			return 'is-danger';
		if (level === '警告')
			return 'is-warning';
		if (level === '注意')
			return 'is-attention';
		return 'is-normal';
	},

	preEolClass: function(status) {
		if (status === '危险')
			return 'is-danger';
		if (status === '警告')
			return 'is-warning';
		return 'is-normal';
	},

	percentClass: function(percent) {
		if (percent >= 95)
			return 'is-danger';
		if (percent >= 75)
			return 'is-warning';
		if (percent >= 55)
			return 'is-attention';
		return 'is-normal';
	},

	styles: function() {
		return [
			'.emmc-health-page{max-width:1280px;margin:0 auto;padding:4px 0 28px;color:#172033}',
			'.emmc-health-header{display:flex;align-items:stretch;justify-content:space-between;gap:16px;margin:6px 0 18px}',
			'.emmc-health-title-wrap{width:100%}',
			'.emmc-health-header h2{margin:0;font-size:26px;line-height:1.2;font-weight:750}',
			'.emmc-health-page~.cbi-page-actions,.emmc-health-page+.cbi-page-actions,.cbi-page-actions{display:none!important}',
			'.emmc-health-content{display:grid;gap:16px}',
			'.emmc-overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
			'.emmc-card,.emmc-panel,.emmc-eol-card,.emmc-alert,.emmc-hero-card{background:#fff;border:1px solid #e3e8ef;border-radius:8px;box-shadow:0 8px 24px rgba(24,39,75,.06)}',
			'.emmc-hero-card{display:flex;align-items:stretch;justify-content:space-between;gap:18px;overflow:hidden;border-left:6px solid var(--tone);background:linear-gradient(90deg,var(--tone-bg),#fff 64%)}',
			'.emmc-hero-main{padding:22px 24px;min-width:0}',
			'.emmc-hero-status{margin-top:8px;color:var(--tone);font-size:42px;line-height:1;font-weight:800}',
			'.emmc-hero-note{margin-top:12px;color:#4b5563;font-size:14px;line-height:1.55}',
			'.emmc-hero-facts{display:grid;grid-template-columns:repeat(3,minmax(110px,1fr));gap:1px;min-width:420px;background:#edf1f6;border-left:1px solid #edf1f6}',
			'.emmc-hero-facts>div{display:flex;flex-direction:column;justify-content:center;gap:8px;padding:18px;background:rgba(255,255,255,.82)}',
			'.emmc-hero-facts span{color:#68758a;font-size:12px;font-weight:650}',
			'.emmc-hero-facts strong{color:#111827;font-size:18px;line-height:1.2}',
			'.emmc-card{padding:18px;min-height:118px;display:flex;flex-direction:column;gap:9px}',
			'.emmc-card-label{color:#68758a;font-size:13px;font-weight:600}',
			'.emmc-card-value{font-size:24px;line-height:1.2;font-weight:750;color:#111827;word-break:break-word}',
			'.emmc-card-note{color:#68758a;font-size:13px;line-height:1.45}',
			'.emmc-status-card{border-left-width:5px}',
			'.is-normal{--tone:#18a058;--tone-bg:#ecfdf3;--tone-soft:#d7f6e4}',
			'.is-attention{--tone:#0f7ab8;--tone-bg:#eef7ff;--tone-soft:#d7ecfb}',
			'.is-warning{--tone:#d97706;--tone-bg:#fff7ed;--tone-soft:#ffedd5}',
			'.is-danger{--tone:#dc2626;--tone-bg:#fef2f2;--tone-soft:#fee2e2}',
			'.emmc-status-card,.emmc-eol-card{border-left-color:var(--tone)}',
			'.emmc-status-card .emmc-card-value,.emmc-eol-status{color:var(--tone)}',
			'.emmc-panel{padding:18px}',
			'.emmc-panel-title{font-size:18px;font-weight:700;margin-bottom:16px}',
			'.emmc-progress-row{display:grid;gap:9px;padding:14px 0;border-top:1px solid #edf1f6}',
			'.emmc-progress-row:first-of-type{border-top:0;padding-top:0}',
			'.emmc-progress-meta{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#4b5563}',
			'.emmc-progress-meta>div{display:flex;gap:10px;align-items:center;min-width:0}',
			'.emmc-progress-meta strong{color:#111827;font-size:15px}',
			'.emmc-raw-badge{display:inline-flex;align-items:center;border-radius:999px;background:#f3f6fa;color:#4b5563;padding:3px 8px;font-family:monospace;font-size:12px;white-space:nowrap}',
			'.emmc-progress-track{height:14px;background:#edf1f6;border-radius:999px;overflow:hidden}',
			'.emmc-progress-fill{height:100%;border-radius:999px;background:var(--tone);transition:width .2s ease}',
			'.emmc-eol-card{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px;border-left-width:5px;background:linear-gradient(90deg,var(--tone-bg),#fff 58%)}',
			'.emmc-eol-status{font-size:26px;font-weight:750;margin-top:6px}',
			'.emmc-alert{padding:18px;border-left:5px solid #dc2626;background:#fef2f2;color:#7f1d1d}',
			'.emmc-alert-title{font-weight:750;font-size:18px;margin-bottom:6px}',
			'@media (max-width: 900px){.emmc-hero-card{flex-direction:column}.emmc-hero-facts{min-width:0;border-left:0;border-top:1px solid #edf1f6}}',
			'@media (max-width: 760px){.emmc-health-page{padding-bottom:18px}.emmc-health-header{align-items:flex-start;flex-direction:column}.emmc-overview-grid{grid-template-columns:1fr}.emmc-hero-facts{grid-template-columns:1fr}.emmc-hero-status{font-size:34px}.emmc-card-value{font-size:21px}.emmc-progress-meta{align-items:flex-start;flex-direction:column}}',
			'@media (prefers-color-scheme: dark){.emmc-health-page{color:#d8dee9}.emmc-card,.emmc-panel,.emmc-eol-card,.emmc-hero-card{background:#1f2937;border-color:#344154;box-shadow:none}.emmc-card-value,.emmc-progress-meta strong,.emmc-panel-title,.emmc-hero-facts strong,.emmc-health-header h2{color:#f3f4f6}.emmc-card-label,.emmc-card-note,.emmc-progress-meta,.emmc-hero-note,.emmc-hero-facts span{color:#aab4c2}.emmc-progress-track,.emmc-raw-badge{background:#111827}.emmc-raw-badge{color:#d1d5db}.emmc-eol-card,.emmc-hero-card{background:#1f2937}.emmc-hero-facts{background:#344154;border-color:#344154}.emmc-hero-facts>div{background:#1f2937}}'
		].join('\n');
	}
});
