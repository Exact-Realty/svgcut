/* Copyright 2020 Ricardo Iván Vieitez Parra
 *
 * All rights reserved.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import { SvgTransformMatrix, parse } from '@generated/svgtransform';

import { Decimal } from '@exact-realty/decimal.js-float';

interface Ellipse {
	rx: Decimal;
	ry: Decimal;
	φ: Decimal;
}

const degToRad = Decimal.acos(0).div(90);
const zero = new Decimal(0);
const one = new Decimal(1);

const identity: SvgTransformMatrix = [one, zero, zero, one, zero, zero];

// Test in browser with
// const catenate = (t) => `matrix(${(()=>{const el = document.createElementNS('http://www.w3.org/2000/svg', 'g'); el.setAttribute('transform', t); const m = el.transform.baseVal.consolidate().matrix; return [m.a, m.b, m.c, m.d, m.e, m.f]})(t).join(' ')})`;
const catenateTransform = (
	A?: SvgTransformMatrix,
	B?: SvgTransformMatrix,
): SvgTransformMatrix | undefined =>
	(A &&
		B && [
			A[0].mul(B[0]).plus(B[1].mul(A[2])),
			B[0].mul(A[1]).plus(B[1].mul(A[3])),
			A[0].mul(B[2]).plus(A[2].mul(B[3])),
			A[1].mul(B[2]).plus(A[3].mul(B[3])),
			A[0].mul(B[4]).plus(A[2].mul(B[5])).plus(A[4]),
			A[1].mul(B[4]).plus(A[3].mul(B[5])).plus(A[5]),
		]) ??
	A ??
	B;

const parseTransform = (
	transform: string,
): SvgTransformMatrix[] | undefined => {
	try {
		return parse(transform);
	} catch (e) {
		return;
	}
};

export class SvgTransform {
	private 𝐌: SvgTransformMatrix;

	static IDENTITY = new SvgTransform(identity);

	constructor(𝐌: SvgTransformMatrix) {
		this.𝐌 = 𝐌;
	}

	static fromString(
		transform?: string,
		CTM?: SvgTransform,
	): SvgTransform | undefined {
		if (!transform) {
			return CTM;
		}

		const 𝐌 = parseTransform(transform)?.reduce(
			(acc?: SvgTransformMatrix, cv?: SvgTransformMatrix) =>
				catenateTransform(acc, cv),
			CTM?.𝐌,
		);

		return (𝐌 && new SvgTransform(𝐌)) ?? CTM;
	}

	toString(): string {
		return `matrix(${this.𝐌.join(' ')})`;
	}

	apply(coord: [Decimal, Decimal]): [Decimal, Decimal] {
		const [a, b, c, d, e, f] = this.𝐌;
		const [x, y] = coord;

		return [
			a.mul(x).plus(c.mul(y)).plus(e),
			b.mul(x).plus(d.mul(y)).plus(f),
		];
	}

	applyRelative(coord: [Decimal, Decimal]): [Decimal, Decimal] {
		const [a, b, c, d] = this.𝐌;
		const [x, y] = coord;

		return [a.mul(x).plus(c.mul(y)), b.mul(x).plus(d.mul(y))];
	}

	applyEllipse(ellipse: Ellipse): Ellipse {
		const [a, b, c, d] = this.𝐌;

		const sinφ = degToRad.mul(ellipse.φ).sin();
		const cosφ = degToRad.mul(ellipse.φ).cos();

		const ε = new Decimal('1e-8');

		const 𝐌 = [
			ellipse.rx.mul(a.mul(cosφ).plus(c.mul(sinφ))),
			ellipse.rx.mul(b.mul(cosφ).plus(d.mul(sinφ))),
			ellipse.ry.mul(c.mul(cosφ).sub(a.mul(sinφ))),
			ellipse.ry.mul(d.mul(cosφ).sub(b.mul(sinφ))),
		];
		const 𝐌𝐌ᵀ: [Decimal, Decimal, undefined, Decimal] = [
			𝐌[0].pow(2).plus(𝐌[2].pow(2)),
			𝐌[0].mul(𝐌[1]).plus(𝐌[2].mul(𝐌[3])),
			undefined,
			𝐌[1].pow(2).plus(𝐌[3].pow(2)),
		];

		if (𝐌𝐌ᵀ[1].div(Decimal.min(𝐌𝐌ᵀ[0], 𝐌𝐌ᵀ[3])).abs().lte(ε)) {
			𝐌𝐌ᵀ[1] = new Decimal(0);
		}

		const λ = 𝐌𝐌ᵀ[0].plus(𝐌𝐌ᵀ[3]);

		const ΔΔ = Decimal.max(
			0,
			λ.pow(2).sub(𝐌𝐌ᵀ[0].mul(𝐌𝐌ᵀ[3]).sub(𝐌𝐌ᵀ[1].pow(2)).mul(4)),
		);

		// If the result is a circle, the eigenvalue calculations are not needed
		if (ΔΔ.div(λ).abs().lte(ε)) {
			return {
				rx: λ.div(2).sqrt(),
				ry: λ.div(2).sqrt(),
				φ: zero,
			};
		}

		const Δ = ΔΔ.sqrt();
		const λ1 = (() => {
			const tmp = λ.plus(Δ).div(2);
			return tmp.sub(𝐌𝐌ᵀ[3]).abs().div(𝐌𝐌ᵀ[3]).lte(ε) ? 𝐌𝐌ᵀ[3] : tmp;
		})();
		const λ2 = λ.sub(Δ).div(2);
		const degenerate = λ2.div(λ1).lte(ε);

		const φ = degenerate
			? zero
			: (𝐌𝐌ᵀ[1].gte(λ1.sub(𝐌𝐌ᵀ[3]).abs())
					? Decimal.atan2(λ1.sub(𝐌𝐌ᵀ[0]), 𝐌𝐌ᵀ[1])
					: Decimal.atan2(𝐌𝐌ᵀ[1], λ1.sub(𝐌𝐌ᵀ[3]))
			  )
					.div(degToRad)
					.toDP(8);

		return {
			rx: degenerate ? zero : λ1.sqrt(),
			ry: degenerate ? zero : λ2.sqrt(),
			φ: φ,
		};
	}

	catenate(next?: SvgTransform): SvgTransform {
		return next
			? new SvgTransform(
					catenateTransform(this.𝐌, next.𝐌) as SvgTransformMatrix,
			  )
			: this;
	}

	get hasRotation(): boolean {
		return !this.𝐌[1].eq(0) || !this.𝐌[2].eq(0);
	}

	get orientationPreserving(): boolean {
		return this.𝐌[0].mul(this.𝐌[3]).sub(this.𝐌[1].mul(this.𝐌[2])).gte(0);
	}

	static catenate(
		...transforms: (SvgTransform | undefined)[]
	): SvgTransform | undefined {
		const 𝐌 = transforms
			.map((transform: SvgTransform | undefined) => transform?.𝐌)
			.reduceRight((acc?: SvgTransformMatrix, cv?: SvgTransformMatrix) =>
				catenateTransform(acc, cv),
			);

		return 𝐌 && new SvgTransform(𝐌);
	}
}
