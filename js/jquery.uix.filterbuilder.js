/*
 * jQuery UIx FilterBuilder
 *
 * Authors:
 *  Yanick Rochon (yanick.rochon[at]gmail[dot]com)
 *
 * Licensed under the MIT (MIT-LICENSE.txt) license.
 *
 * Depends:
 * jQuery UI 1.9+
 *
 */

(function( $, undefined ) {

    var PARAM_REGEX = new RegExp("(@\\d+)", 'gi');
	var EXPRESSION_REGEX = new RegExp("\\{:([^}]+)\\}", 'gi');


	var FILTER_SKELETON = '<table class="expr-clause"><tbody><tr>' +
			'<td><div class="expr-select"></div></td>' +
			'<td class="ui-widget-content ui-corner-left" style="width: 8px; border-right:none;"></td> ' +
			'<td><div class="expr-conditions"></div><div class="expr-new-condition"></div></td>' +
		'</tr></tbody></table>';
	var CLAUSE_SKELETON = '<table class="expr-condition"><tbody><tr>' +
			'<td><div class="expr-controls"></div></td><td><div class="expr-field"></div></td><td><div class="expr-operator"></div></td><td><div class="expr-params"></div></td>' +
		'</tr></tbody></table>';


	$.widget("uix.filterbuilder", {
		options: {
			// options
			fields: [],               // an array of available fields (string)
			locale: 'auto',           // the widget's locale
            rule: 'js',               // the filter rules to apply

			// events
			create: null,             // event triggered when the widget has been created
			clauseAdded: null,        // event triggered when a new clause is added; ui receives the clause element container created
			clauseRemoved: null,      // event triggerformatExpressioned when a clause is removed; ui receives the detached clause element
			clauseParamsChange: null, // event triggered when a clause operator has changed, thus changing the params
			change: null              // event triggered when the filter builder has changed
		},

		_create: function () {
			this._setLocale();
            this._setRule();
			this._initFilter(this.element);


			this._trigger("create");
		},

		_setOption: function (key, value) {
			if (key === "locale") {
				this._setLocale(value);
			} else if (key === "rule") {
                this._setRule(value);
            }

			this._delay("refresh");
		},

		_refresh: function () {
			// TODO : replace all SELECT elements options, update buttons text
		},

		_destroy: function () {
			this._trigger("clauseRemoved", null, {
				subClause: this.element
			});

			this.element.empty();  // cleanup everything
		},

		_setLocale: function (locale) {
            var t;

			locale = locale || this.options.locale || 'auto';

			if (locale == 'auto') {
				locale = navigator.userLanguage ||
                         navigator.language ||
                         navigator.browserLanguage ||
                         navigator.systemLanguage ||
                         '';
			}
			if (!$.uix.filterbuilder.i18n[locale]) {
				locale = '';   // revert to default is not supported auto locale
			}
			this.options.locale = locale;
            t = $.uix.filterbuilder.i18n[locale];
			this._t = function(key) {
                return t[key] || key;
            };
		},

        _setRule: function(rule) {
            rule = rule || this.options.rule;

            if (!$.uix.filterbuilder.rules[rule]) {
                throw ("Specified rule not found : " + rule);
            }

            this.options.rule = rule;
            this._r = $.uix.filterbuilder.rules[rule];
        },

		_initFilter: function(element) {
			return $(FILTER_SKELETON)
				.find(".expr-select").append(this._clauseOperatorsSelect(true)).end()
				.find(".expr-conditions").append(this._clauseCondition(null /* default */)).end()
				.find(".expr-new-condition").append(this._clauseAddCondition()).end()
				.appendTo(element)
			;
		},


		_clauseOperatorsSelect: function(clauseExpressions) {
			var select = $("<select>");
			var self = this;
            var defOperKey = "default" + (clauseExpressions ? "Clause" : "Field") + "Expression";
            var defOper = this._r[defOperKey];

			$.each(this._r[(clauseExpressions ? "clause" : "field") + "Expressions"], function (oper, expression) {
				select.append($("<option>")
					.prop("selected", oper === defOper)
					.val(oper)
					.text(self._t(oper)));
			});

			return select.on("change", function (e) {
				// TODO : add UI object context... ?
				self._trigger("change");
			});
		},

		_clauseCondition: function(operator) {
			var self = this;

            operator = operator || this._r.defaultFieldExpression;

			return $(CLAUSE_SKELETON)
				.find(".expr-controls")
					.append($('<a href="#remove" role="button">').text(self._t("btn.remove")).on("click", function(e) {
						var count = $(this).closest(".expr-conditions").find(".expr-condition").length;
						var currentClause = $(this).closest(".sub-clause");

						if (count > 1) {
							self._trigger("clauseRemoved", e, {
								clause: (currentClause = $(this).closest(".expr-condition").detach())
							});
						} else if (currentClause.length) {

							var subClause = currentClause.find(".sub-clause").filter(function(e) {
								return $(this).parentsUntil(currentClause, ".sub-clause").length === 0;
							}).detach();

							if (subClause.length) {
								currentClause.before(subClause).detach();
							} else {
								currentClause.detach();
							}

							self._trigger("clauseRemoved", e, {
								subClause: currentClause
							});
						}

						currentClause.remove(); // cleanup

						return e.preventDefault(), e.stopPropagation(), false;
					})).end()
				.find(".expr-field").append( self._clauseField(operator) ).end()
				.find(".expr-operator").append(self._clauseOperatorsSelect().on("change", function (e) {
                    var params = $(this).closest(".expr-condition").find(".expr-params");
					var oldParams = params.children();
					var newParams = self._clauseParams($(this).val());

					// transfer old -> new params
					newParams.filter("[data-param-name]").each(function (i, nel) {
						oldParams.filter("[data-param-name]").each(function (i, oel) {
							if (($(oel).data("param-name") === $(nel).data("param-name")) && ($(oel).prop("nodeName") === $(nel).prop("nodeName"))) {
								$(nel).val($(oel).val());
                                if ($(oel).is(":checked")) {
                                    $(nel).prop("checked", true);
                                }
							}
						});
					});

					self._trigger("clauseParamsChange", e, {
						oldParams: oldParams,
						newParams: newParams
					});

					params.empty().append(newParams);

				})).end()
				.find(".expr-params").append( self._clauseParams(operator) ).end();
			;
		},

        _clauseField: function (operator) {
            var self = this;
            var expr = this._r.fieldExpressions[operator];

            if (expr.params["@1"]) {
                return this._r.paramHandlers[expr.params["@1"]].render.call(this).attr("data-param-name", "@1")
                    .on("change", function(e) {	self._trigger("change", e); });
            } else {
                return $("<span>");
            }
        },

		_clauseParams: function (operator) {
            var self = this;
            var expr = this._r.fieldExpressions[operator];
            var params = $();

            $.each(expr.params, function(name, renderer) {
                if (name !== "@1") {
                    params = params.add( self._r.paramHandlers[renderer].render.call(self).attr("data-param-name", name)
                        .on("change", function(e) {	self._trigger("change", e); }) );
                }
            });

			return params;
		},

		_clauseAddCondition: function () {
			var self = this;
			return $("<div>")
				.append($('<a href="#add" role="button">').text(self._t("btn.add")).on("click", function (e) {
					var currentClause = self._clauseCondition();

					$(this).closest(".expr-new-condition").siblings(".expr-conditions").append(currentClause);

					self._trigger("clauseAdded", e, { clause: currentClause });

					return e.preventDefault(), e.stopPropagation(), false;
				}))
				.append($('<a href="#add-sub" role="button">').text(self._t("btn.add.sub")).on("click", function (e) {
					var subFilter = $("<div>").addClass("sub-clause");
					self._initFilter(subFilter);
					$(this).closest(".expr-new-condition").before(subFilter);

					self._trigger("clauseAdded", e, { subClause: subFilter });

					return e.preventDefault(), e.stopPropagation(), false;
				}))
			;
		},

		compile: function () {
			return _compile(this.element, this);
		}

	});


	function _compile(element, ctx) {
		var self = this;
		var left = null;
		var subClauseStart = ctx._r.clauseEscape.start;
		var subClauseEnd = ctx._r.clauseEscape.end;

		element.find("table.expr-clause").filter(function (e) {
			return $(this).parentsUntil(element, "table.expr-clause").length === 0;
		}).each(function (i, subClause) {
			var glue = $(subClause).find(".expr-select select").val();
			var right;

			$(subClause).find(".expr-conditions").filter(function(e) {
				return $(this).parentsUntil(subClause, "table.expr-clause").length === 0;
			}).find(".expr-condition").each(function (i, clause) {
				var operator = $(clause).find(".expr-operator select").val();
                var expr = ctx._r.fieldExpressions[operator];
				var values = {};

                $.each(expr.params, function(name, renderer) {
                    values[name] = ctx._r.paramHandlers[renderer].format.call(self, $(clause).find("[data-param-name='" + name + "']")) || "";
                });

				right = formatExpression(ctx._r.fieldExpressions[operator].pattern, ctx._r.operators, values);

				if (left) {
					left = formatExpression(ctx._r.clauseExpressions[glue].pattern, ctx._r.operators, [left, right]);
				} else {
					left = right;
				}
			});

			right = _compile($(subClause), ctx);
			if (right) {
				if (left) {
					left = formatExpression(ctx._r.clauseExpressions[glue].pattern, ctx._r.operators, [left, subClauseStart + right + subClauseEnd]);
				} else {
					left = right;
				}
			}

			// wrap if necessary
			right = formatExpression(ctx._r.clauseExpressions[glue].wrap, ctx._r.operators, { "@1": left });
			if (right) {
				left = right;
			}
		});

		return left;
	};

	function formatExpression(pattern, operators, paramValues) {
        if (!pattern) return false;
		paramValues = paramValues || [];

		return pattern.replace(EXPRESSION_REGEX, function (g, e) {
			return operators[e];
		}).replace(PARAM_REGEX, function (g, p) {
			return paramValues[p] || "false";
		});
	};

	var t = $.uix.filterbuilder.i18n = {
		'': {
			"expr.match.all": "Match All",
			"expr.match.any": "Match Any",
			"expr.match.none": "Match.none",

			"expr.equal": "equals",
			"expr.not.equal": "not equals",
			"expr.match": "matches",
			"expr.not.match": "differs from",
			"expr.null": "is null",
			"expr.not.null": "is not null",
			"expr.between": "between (exclusive)",
			"expr.between.inc": "between (inclusive)",
			"expr.contain": "contains",
			"expr.not.contain": "does not contain",
			"expr.start.with": "starts with",
			"expr.not.start.with": "does not start with",
			"expr.end.with": "ends with",
			"expr.not.end.with": "does not end with",
			"expr.less.than": "less than",
			"expr.less.than.equal": "less than or equal to",
			"expr.greater.than": "greater than",
			"expr.greater.than.equal": "greater than or equal to",

			"btn.add": "Add",
			"btn.add.sub": "Add Sub",
			"btn.remove": "Remove",

            "param.check.field": "Field"
		}
	};

    // must define roles elsewhere
    $.uix.filterbuilder.rules = {}

})(jQuery);
