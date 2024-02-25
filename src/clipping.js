import * as THREE from "three";


function ShapeToBufferGeometry(shape) {
    const positions =
        shape.vertices instanceof Float32Array
            ? shape.vertices
            : new Float32Array(shape.vertices.flat());
    const normals =
        shape.normals instanceof Float32Array
            ? shape.normals
            : new Float32Array(shape.normals.flat());
    const triangles =
        shape.triangles instanceof Uint32Array
            ? shape.triangles
            : new Uint32Array(shape.triangles.flat());

    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(triangles, 1));

    return geometry;
}

function createPlaneStencilGroup(geometry, plane, renderOrder, group) {

    const baseMat = new THREE.MeshBasicMaterial();
    baseMat.depthWrite = false;
    baseMat.depthTest = false;
    baseMat.colorWrite = false;
    baseMat.stencilWrite = true;
    baseMat.stencilFunc = THREE.AlwaysStencilFunc;

    // back faces
    const mat0 = baseMat.clone();
    mat0.side = THREE.BackSide;
    mat0.clippingPlanes = [plane];
    mat0.stencilFail = THREE.IncrementWrapStencilOp;
    mat0.stencilZFail = THREE.IncrementWrapStencilOp;
    mat0.stencilZPass = THREE.IncrementWrapStencilOp;

    const mesh0 = new THREE.Mesh(geometry, mat0);
    mesh0.renderOrder = renderOrder;
    group.add(mesh0);

    // front faces
    const mat1 = baseMat.clone();
    mat1.side = THREE.FrontSide;
    mat1.clippingPlanes = [plane];
    mat1.stencilFail = THREE.DecrementWrapStencilOp;
    mat1.stencilZFail = THREE.DecrementWrapStencilOp;
    mat1.stencilZPass = THREE.DecrementWrapStencilOp;

    const mesh1 = new THREE.Mesh(geometry, mat1);
    mesh1.renderOrder = renderOrder;

    group.add(mesh1);
    return group;
}

function flatten(parts) {
    let flatList = [];
    for (let part of parts) {
        if (part.hasOwnProperty("parts")) {
            flatList = flatList.concat(flatten(part.parts));
        }
        else {
            flatList.push(part);
        }
    }
    return flatList;
}

class Clipping {

    constructor(center, size, distance, uiCallback, theme, nestedGroup, scene) {
        this.distance = distance;
        this.uiCallback = uiCallback;

        const normals = [
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 0, -1)
        ];

        this.clipPlanes = [];
        this.clipAxis = [];

        for (var i = 0; i < 3; i++) {
            this.clipPlanes.push(new THREE.Plane(normals[i], distance));
            this.clipAxis.push({ stencils: [] });
            this.uiCallback(i, normals[i].toArray());
        }

        let object = new THREE.Object3D();
        let stencilGroup = new THREE.Group();

        let parts = flatten(nestedGroup.shapes.parts);

        for (let part of parts) {

            let shape = part.shape;
            let geometry = ShapeToBufferGeometry(shape);
            for (let i = 0; i < 3; i++) {
                const plane = this.clipPlanes[i];
                stencilGroup = createPlaneStencilGroup(geometry, plane, i + 1, stencilGroup);
            }

            const planeGeom = new THREE.PlaneGeometry(size, size);

            for (let i = 0; i < 3; i++) {

                const poGroup = new THREE.Group();
                const plane = this.clipPlanes[i];
                const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);

                // plane is clipped by the other clipping planes
                const planeMat =
                    new THREE.MeshStandardMaterial({

                        color: part.color,
                        metalness: 0.1,
                        roughness: 0.75,
                        clippingPlanes: otherPlanes,

                        stencilWrite: true,
                        stencilRef: 0,
                        stencilFunc: THREE.NotEqualStencilFunc,
                        stencilFail: THREE.ReplaceStencilOp,
                        stencilZFail: THREE.ReplaceStencilOp,
                        stencilZPass: THREE.ReplaceStencilOp,

                    });
                const po = new THREE.Mesh(planeGeom, planeMat);
                po.lookAt(plane.normal.clone().negate());
                po.onAfterRender = function(renderer) {

                    renderer.clearStencil();

                };

                po.renderOrder = i + 1.1;

                poGroup.add(po);
                this.clipAxis[i].stencils.push(po);
                scene.add(poGroup);
            }
        }
        object.add(stencilGroup);

        this.planeHelpers = object;
        this.clippedFaces = stencilGroup;
    }


    setConstant(index, value) {
        this.clipPlanes[index].constant = value;
        for (let i = 0; i < this.clipAxis[index].stencils.length; i++) {
            this.clipAxis[index].stencils[i].position
                .copy(this.clipPlanes[index].normal)
                .multiplyScalar(-value);
        }
    }

    setNormal = (index, normal) => {
        this.clipPlanes[index].normal = normal;
        this.uiCallback(index, normal.toArray());
    };
}

export { Clipping };
